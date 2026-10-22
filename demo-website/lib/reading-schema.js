'use strict';
const db = require('./db');
const columns = ['exercises.module', 'exercises.content_key', 'exercises.available_from',
  'exercises.available_until', 'exercises.is_required', 'exercises.learning_config',
  'exercise_attempts.learning_state', 'exercise_attempts.last_opened_at', 'student_vocabulary.dictionary_key'];
module.exports = { columns, ready: () => columns.every(column => db.hasColumn(column)) };
