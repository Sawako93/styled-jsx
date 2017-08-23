import hashString from 'string-hash'

const isBrowser = typeof window !== 'undefined'
const useSingleSheet = css => Array.isArray(css)
function noop() {}

const computeId = (function() {
  const cache = {}
  return function(baseId, props) {
    const propsToString = String(props)
    const key = baseId + propsToString
    if (!cache[key]) {
      cache[key] = `jsx-${hashString(`${baseId}-${propsToString}`)}`
    }
    return cache[key]
  }
})()

const computeSelector = (function() {
  const cache = {}
  return function(id, css) {
    if (!cache[id]) {
      cache[id] = css.replace(/jsx-xxx/g, id)
    }
    return cache[id]
  }
})()

let fromServer
const instancesCounts = {}
const tags = {}
let sheet

function getIdAndCss(props) {
  if (props.dynamic) {
    const styleId = computeId(props.styleId, props.dynamic)
    return {
      styleId,
      rules: useSingleSheet(props.css)
        ? props.css.map(rule => computeSelector(styleId, rule))
        : [computeSelector(styleId, props.css)]
    }
  }

  return {
    styleId: props.styleId,
    rules: useSingleSheet(props.css) ? props.css : [props.css]
  }
}

function selectFromServer() {
  const elements = Array.prototype.slice(
    document.querySelectorAll('[data-jsx-ssr]')
  )
  return elements.reduce((acc, element) => {
    acc[element.getAttribute('data-jsx-ssr')] = element
    return acc
  }, {})
}

function insert(props) {
  if (!fromServer) {
    fromServer = selectFromServer()
  }

  const { styleId, rules } = getIdAndCss(props)

  if (styleId in instancesCounts) {
    instancesCounts[styleId] += 1
    return
  }

  instancesCounts[styleId] = 1

  if (fromServer[styleId]) {
    tags[styleId] = fromServer[styleId]
    return
  }

  if (!useSingleSheet(props.css)) {
    tags[styleId] = makeStyleTag(rules[0])
    return
  }

  if (!sheet) {
    sheet = makeStyleTag('').sheet
  }

  // Insertion interval
  tags[styleId] = [
    // Start
    sheet.cssRules.length,
    // End
    sheet.cssRules.length + rules.length - 1
  ]

  rules.forEach(rule => sheet.insertRule(rule, sheet.cssRules.length))
}

function remove(props) {
  const { styleId } = getIdAndCss(props)
  instancesCounts[styleId] -= 1
  if (instancesCounts[styleId] < 1) {
    delete instancesCounts[styleId]
    const t = tags[styleId]
    delete tags[styleId]

    if (!useSingleSheet(props.css) || fromServer[styleId]) {
      t.parentNode.removeChild(t)
      delete fromServer[styleId]
      return
    }

    for (let i = t[0]; i <= t[1]; i++) {
      sheet.deleteRule(i)
      sheet.insertRule('styledjsx-deleted-rule {}', i)
    }
  }
}

function update(props, nextProps) {
  const { styleId } = getIdAndCss(props)
  if (instancesCounts[styleId] === 1 && !useSingleSheet(props.css)) {
    const next = getIdAndCss(nextProps)
    const t = tags[styleId]
    delete tags[styleId]
    delete instancesCounts[styleId]
    t.textContent = next.rules[0]
    tags[next.styleId] = t
    instancesCounts[next.styleId] = 1
    return
  }
  insert(nextProps)
  remove(props)
}

function makeStyleTag(str) {
  // Based on implementation by glamor
  const tag = document.createElement('style')
  tag.setAttribute('data-jsx-client', '')
  tag.appendChild(document.createTextNode(str))

  const head = document.head || document.getElementsByTagName('head')[0]
  head.appendChild(tag)

  return tag
}

export default {
  insert: isBrowser ? insert : noop,
  remove: isBrowser ? remove : noop,
  update: isBrowser ? update : noop,
  computeId,
  computeSelector
}