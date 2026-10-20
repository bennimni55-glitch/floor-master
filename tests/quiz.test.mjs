// npx tsx tests/quiz.test.mjs — the quiz API must never leak is_correct to the client
import assert from 'node:assert/strict'
import { sanitizeQuestions } from '../src/lib/quiz.ts'

const dbRows = [
  {
    id: 'q1',
    category: 'menu',
    difficulty: 'easy',
    question_text: 'שאלה?',
    options: [
      { text: 'א', is_correct: false },
      { text: 'ב', is_correct: true },
    ],
    explanation: 'הסבר',
    points: 10,
  },
]

const out = sanitizeQuestions(dbRows)

// Same question, same option texts and order
assert.equal(out[0].id, 'q1')
assert.deepEqual(out[0].options.map(o => o.text), ['א', 'ב'])

// No is_correct anywhere in the serialized payload (what the client would receive)
assert.ok(!JSON.stringify(out).includes('is_correct'), 'is_correct leaked to client payload')

// Degenerate input (options not an array) doesn't crash
const weird = sanitizeQuestions([{ options: null, question_text: 'x', category: 'c', difficulty: 'easy', points: 5 }])
assert.deepEqual(weird[0].options, [])

console.log('quiz.test: all assertions passed')
