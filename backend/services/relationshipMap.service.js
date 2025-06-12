// Relationship mapping service
// Creates lightweight in-memory links between emails, calendar events and tasks
// and exposes a helper to retrieve related items for a given entry.
// The mapping is rebuilt on every request in which it is called – this keeps the
// service stateless and avoids memory leaks in long-running processes.

const DAY_MS = 24 * 60 * 60 * 1000;

// Helper – simple keyword extractor (very naïve but fast and dependency-free)
function extractKeywords(text = "") {
  return (
    text
      .toLowerCase()
      // Split on anything that is not a letter, number or dash
      .split(/[^a-z0-9-]+/g)
      // Short words are rarely helpful for context mapping
      .filter((w) => w.length > 3)
      // Remove common stop words
      .filter(
        (w) =>
          ![
            "about",
            "after",
            "again",
            "below",
            "could",
            "would",
            "there",
            "their",
            "where",
            "which",
            "these",
            "this",
            "with",
            "have",
            "from",
            "that",
            "subject",
          ].includes(w)
      )
  );
}

// Closure-scoped caches
let _map = null;

function buildRelationshipMap(emails = [], events = [], tasks = []) {
  // Reset map every time we rebuild
  _map = {
    // Original objects for quick lookup
    emailById: {},
    eventById: {},
    taskById: {},
    // Indexes
    personIndex: new Map(), // personName -> Set<itemKey>
    keywordIndex: new Map(), // keyword     -> Set<itemKey>
    dateIndex: new Map(), // yyyymmdd     -> Set<itemKey>
  };

  // Normalise helper
  const addToIndex = (index, key, itemKey) => {
    if (!key) return;
    if (!index.has(key)) index.set(key, new Set());
    index.get(key).add(itemKey);
  };

  const addItem = (itemKey, obj, type) => {
    if (type === "email") _map.emailById[itemKey] = obj;
    if (type === "event") _map.eventById[itemKey] = obj;
    if (type === "task") _map.taskById[itemKey] = obj;
  };

  // ----  Index emails ----
  emails.forEach((email) => {
    const key = `email:${email.id}`;
    addItem(key, email, "email");

    // Person index (sender)
    const sender = (email.from || "").split("<")[0].trim();
    if (sender) addToIndex(_map.personIndex, sender.toLowerCase(), key);

    // Keyword index (subject + body)
    const keywords = [
      ...extractKeywords(email.subject || ""),
      ...extractKeywords(email.snippet || email.body || ""),
    ];
    keywords.forEach((kw) => addToIndex(_map.keywordIndex, kw, key));

    // Date index (email date may be string – parse to Date)
    const ts = email.internalDate ? Number(email.internalDate) : Date.now();
    const dateStr = new Date(ts).toISOString().slice(0, 10); // yyyy-mm-dd
    addToIndex(_map.dateIndex, dateStr, key);
  });

  // ----  Index events ----
  events.forEach((event) => {
    const key = `event:${event.id}`;
    addItem(key, event, "event");

    // People (attendees & organiser)
    const people = [
      ...(event.attendees || []),
      event.organizer?.displayName || event.organizer || "",
    ].filter(Boolean);
    people.forEach((p) => addToIndex(_map.personIndex, p.toLowerCase(), key));

    // Keywords (title + description)
    const kws = [
      ...extractKeywords(event.summary || ""),
      ...extractKeywords(event.description || ""),
    ];
    kws.forEach((kw) => addToIndex(_map.keywordIndex, kw, key));

    // Date index – span may cross days, so index start date only for now
    const startStr = (event.start || "").slice(0, 10);
    if (startStr) addToIndex(_map.dateIndex, startStr, key);
  });

  // ----  Index tasks ----
  tasks.forEach((task) => {
    const key = `task:${task.id}`;
    addItem(key, task, "task");

    // People: not usually part of task, skip

    // Keywords (title + notes)
    const kws = [
      ...extractKeywords(task.title || ""),
      ...extractKeywords(task.notes || ""),
    ];
    kws.forEach((kw) => addToIndex(_map.keywordIndex, kw, key));

    // Date – due date only if present
    if (task.due) {
      const dueStr = task.due.slice(0, 10);
      addToIndex(_map.dateIndex, dueStr, key);
    }
  });

  return _map;
}

function _gatherRelatedIds(set, excludeKey) {
  return [...set].filter((k) => k !== excludeKey);
}

function getContextRelationships(item) {
  if (!_map) return [];

  // Determine the key used in the map for this item
  let itemKey;
  if (item.id && item.type === "email") itemKey = `email:${item.id}`;
  else if (item.id && item.type === "event") itemKey = `event:${item.id}`;
  else if (item.id && item.type === "task") itemKey = `task:${item.id}`;
  else {
    // Try best-effort fallback (based on id prefix detection)
    if (item.id && _map.emailById[`email:${item.id}`])
      itemKey = `email:${item.id}`;
    if (item.id && _map.eventById[`event:${item.id}`])
      itemKey = `event:${item.id}`;
    if (item.id && _map.taskById[`task:${item.id}`])
      itemKey = `task:${item.id}`;
  }
  if (!itemKey) return [];

  const related = new Set();

  // Persons
  const people = [];
  if (item.from) people.push(item.from.split("<")[0].trim());
  if (item.attendees) people.push(...item.attendees);
  people
    .map((p) => p.toLowerCase())
    .forEach((person) => {
      const set = _map.personIndex.get(person);
      if (set) _gatherRelatedIds(set, itemKey).forEach((id) => related.add(id));
    });

  // Keywords
  const kws = [];
  if (item.subject) kws.push(...extractKeywords(item.subject));
  if (item.title) kws.push(...extractKeywords(item.title));
  if (item.summary) kws.push(...extractKeywords(item.summary));
  if (item.snippet) kws.push(...extractKeywords(item.snippet));
  if (item.notes) kws.push(...extractKeywords(item.notes));
  kws.forEach((kw) => {
    const set = _map.keywordIndex.get(kw);
    if (set) _gatherRelatedIds(set, itemKey).forEach((id) => related.add(id));
  });

  // Date overlap (same day)
  if (item.date) {
    const dateStr = new Date(item.date).toISOString().slice(0, 10);
    const set = _map.dateIndex.get(dateStr);
    if (set) _gatherRelatedIds(set, itemKey).forEach((id) => related.add(id));
  }
  if (item.start) {
    const dateStr = item.start.slice(0, 10);
    const set = _map.dateIndex.get(dateStr);
    if (set) _gatherRelatedIds(set, itemKey).forEach((id) => related.add(id));
  }
  if (item.dueDate || item.due) {
    const dateStr = (item.dueDate || item.due).slice(0, 10);
    const set = _map.dateIndex.get(dateStr);
    if (set) _gatherRelatedIds(set, itemKey).forEach((id) => related.add(id));
  }

  // Map back to objects
  const objects = [];
  related.forEach((relKey) => {
    if (relKey.startsWith("email:")) objects.push(_map.emailById[relKey]);
    else if (relKey.startsWith("event:")) objects.push(_map.eventById[relKey]);
    else if (relKey.startsWith("task:")) objects.push(_map.taskById[relKey]);
  });

  return objects;
}

module.exports = {
  buildRelationshipMap,
  getContextRelationships,
};
