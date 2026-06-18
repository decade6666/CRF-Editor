function createSeededRandom(seed = 1) {
  let state = seed >>> 0
  return function next() {
    state = (1664525 * state + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function integer(random, min, max) {
  return Math.floor(random() * (max - min + 1)) + min
}

function boolean(random) {
  return random() >= 0.5
}

function double(random, min, max) {
  return random() * (max - min) + min
}

function string(random, minLength, maxLength, alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 _-') {
  const length = integer(random, minLength, maxLength)
  let result = ''
  for (let i = 0; i < length; i += 1) {
    result += alphabet[integer(random, 0, alphabet.length - 1)]
  }
  return result
}

function asciiString(random, minLength, maxLength) {
  const chars = []
  const length = integer(random, minLength, maxLength)
  for (let i = 0; i < length; i += 1) {
    chars.push(String.fromCharCode(integer(random, 32, 126)))
  }
  return chars.join('')
}

function sample(array, random) {
  return array[integer(random, 0, array.length - 1)]
}

function maybe(random, valueFactory, nil = null, probability = 0.35) {
  return random() < probability ? nil : valueFactory()
}

function repeat(count, fn) {
  return Array.from({ length: count }, (_, index) => fn(index))
}

async function forAll({ seed = 424242, runs = 100, property }) {
  const random = createSeededRandom(seed)
  for (let run = 0; run < runs; run += 1) {
    await property({ random, run })
  }
}

export { asciiString, boolean, createSeededRandom, double, forAll, integer, maybe, repeat, sample, string }
