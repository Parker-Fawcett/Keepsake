import OpenAI from 'openai'

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

// Capitalized words that are almost never a person's name. Single
// occurrences of anything else are ignored; repeats get flagged at low
// confidence for the user to confirm or exclude in review.
const NAME_STOPWORDS = new Set([
  ...MONTHS,
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
  'today', 'yesterday', 'tomorrow', 'morning', 'evening', 'night',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'them', 'us', 'him', 'her',
  'his', 'hers', 'my', 'your', 'our', 'their', 'mine', 'yours', 'ours',
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'there', 'here',
  'what', 'when', 'where', 'why', 'how', 'who', 'whom', 'whose', 'which',
  'and', 'but', 'or', 'nor', 'for', 'so', 'yet', 'with', 'about', 'into',
  'from', 'during', 'after', 'before', 'between', 'through', 'over', 'under',
])

const extractionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'people'],
  properties: {
    summary: { type: 'string' },
    people: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'relationship', 'confidence', 'facts', 'dates'],
        properties: {
          name: { type: 'string' },
          relationship: { type: ['string', 'null'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          facts: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['category', 'value', 'confidence'],
              properties: {
                category: { type: 'string', enum: ['like', 'dislike', 'gift_idea', 'family', 'work', 'place', 'memory', 'follow_up', 'other'] },
                value: { type: 'string' },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
              },
            },
          },
          dates: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['label', 'month', 'day', 'year', 'recursYearly', 'confidence'],
              properties: {
                label: { type: 'string' },
                month: { type: 'integer', minimum: 1, maximum: 12 },
                day: { type: 'integer', minimum: 1, maximum: 31 },
                year: { type: ['integer', 'null'] },
                recursYearly: { type: 'boolean' },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
              },
            },
          },
        },
      },
    },
  },
}

function localExtraction(rawText, knownPeople) {
  const lower = rawText.toLowerCase()
  const detectedNames = new Set(knownPeople.filter(person => lower.includes(person.name.toLowerCase())).map(person => person.name))
  for (const match of rawText.matchAll(/\b(?:my\s+)?(?:friend|partner|girlfriend|boyfriend|wife|husband|mom|mother|dad|father|sister|brother|coworker)\s+(?:is\s+)?([A-Z][a-z]+)/g)) detectedNames.add(match[1])
  for (const match of rawText.matchAll(/\b([A-Z][a-z]+)(?:'s|’s)\s+(?:birthday|anniversary|interview|favorite)/g)) detectedNames.add(match[1])

  // Full "First Last" names standing bare in the text are high-signal, but a
  // sentence-starting verb pair ("Love Thai food") is not a name. Accept a
  // pair seen twice, or once mid-sentence.
  const multiNames = new Set()
  const multiSightings = new Map()
  for (const match of rawText.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g)) {
    const words = match[1].split(/\s+/)
    if (words.some(word => NAME_STOPWORDS.has(word.toLowerCase()))) continue
    const preceding = rawText.slice(0, match.index).trimEnd()
    const midSentence = preceding !== '' && !/[.!?\n]$/.test(preceding)
    const sighting = multiSightings.get(match[1]) || { count: 0, midSentence: false }
    sighting.count += 1
    sighting.midSentence = sighting.midSentence || midSentence
    multiSightings.set(match[1], sighting)
  }
  for (const [name, sighting] of multiSightings) {
    if (sighting.count >= 2 || sighting.midSentence) multiNames.add(name)
  }
  for (const name of multiNames) detectedNames.add(name)
  const multiFirstWords = new Set([...multiNames].map(name => name.split(/\s+/)[0].toLowerCase()))

  // A lone capitalized word mentioned twice is probably someone. Mentioned
  // once, it stays out: "Google" or "Monday" must never become a card.
  const counts = new Map()
  for (const match of rawText.matchAll(/\b([A-Z][a-z]{1,})\b/g)) {
    const word = match[1]
    if (NAME_STOPWORDS.has(word.toLowerCase())) continue
    if (multiFirstWords.has(word.toLowerCase())) continue
    if ([...multiNames].some(name => name.toLowerCase().split(/\s+/).includes(word.toLowerCase()))) continue
    counts.set(word, (counts.get(word) || 0) + 1)
  }
  const repeatedNames = new Map()
  for (const [word, count] of counts) {
    if (count < 2) continue
    const canonical = [...detectedNames].find(existing => existing.toLowerCase() === word.toLowerCase())
    if (canonical) continue
    detectedNames.add(word)
    repeatedNames.set(word, true)
  }

  const confidenceFor = name => {
    const known = knownPeople.find(person => person.name.toLowerCase() === name.toLowerCase())
    if (known) return 0.98
    if (multiNames.has(name)) return 0.62
    if (repeatedNames.has(name)) return 0.55
    return 0.68
  }

  const names = [...detectedNames]
  return {
    summary: names.length ? `Found details about ${names.join(', ')}.` : 'This note needs a quick person review.',
    people: names.map(name => {
      const known = knownPeople.find(person => person.name.toLowerCase() === name.toLowerCase())
      const facts = []
      const likeMatch = rawText.match(new RegExp(`${name}(?:'s|’s)?[^.]{0,35}?(?:loves|likes|favorite(?: is| are)?)\\s+([^.!?]+)`, 'i'))
      if (likeMatch) facts.push({ category: 'like', value: likeMatch[1].trim(), confidence: 0.72 })

      const dates = []
      for (const match of rawText.matchAll(new RegExp(`(?:${name}(?:'s|’s)?[^.]{0,35})?(birthday|anniversary)[^.]{0,20}?(${MONTHS.join('|')})\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?`, 'gi'))) {
        dates.push({ label: match[1].toLowerCase() === 'birthday' ? 'Birthday' : 'Anniversary', month: MONTHS.indexOf(match[2].toLowerCase()) + 1, day: Number(match[3]), year: match[4] ? Number(match[4]) : null, recursYearly: true, confidence: 0.82 })
      }
      return {
        name,
        relationship: known?.relationship || null,
        confidence: confidenceFor(name),
        facts,
        dates,
      }
    }),
  }
}

export async function extractRelationships(rawText, knownPeople) {
  if (!process.env.OPENAI_API_KEY) return { mode: 'local', data: localExtraction(rawText, knownPeople) }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    store: false,
    instructions: `Extract only explicit relationship information from the note. Never invent a person, date, relationship, preference, or event. Use null when the relationship is not stated. Distinguish facts from guesses with calibrated confidence. Known people: ${knownPeople.map(person => `${person.name} (${person.relationship})`).join(', ') || 'none'}.`,
    input: rawText,
    text: { format: { type: 'json_schema', name: 'keepsake_relationship_note', strict: true, schema: extractionSchema } },
  })
    return { mode: 'openai', data: JSON.parse(response.output_text) }
  } catch {
    return { mode: 'local', data: localExtraction(rawText, knownPeople) }
  }
}
