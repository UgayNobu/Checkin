// CST IDs vary (02250368, STF-001, U001). We only trim + uppercase so lookups are forgiving.
const MAX_ID_LENGTH = 20;
const normalizeId = (input) => String(input || '').trim().toUpperCase();

module.exports = { normalizeId, MAX_ID_LENGTH };
