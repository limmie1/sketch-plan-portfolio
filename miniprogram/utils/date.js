/* 日期工具：全部用 YYYY-MM-DD 字符串做键，避免时区与 Date 对象的隐式转换坑 */
function pad(n) { return (n < 10 ? '0' : '') + n }

function key(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

function todayKey() { return key(new Date()) }

function parse(s) {
  var p = String(s || '').split('-')
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]))
}

function addDays(s, n) {
  var d = parse(s)
  d.setDate(d.getDate() + n)
  return key(d)
}

function diffDays(a, b) {
  return Math.round((parse(b) - parse(a)) / 864e5)
}

function weekday(s) {
  return ['日', '一', '二', '三', '四', '五', '六'][parse(s).getDay()]
}

function cnDate(s) {
  var d = parse(s)
  return (d.getMonth() + 1) + '月' + d.getDate() + '日'
}

function cnMonth(y, m) { return y + '年' + (m + 1) + '月' }

/* '09:30' + 60 → '10:30'（跨天回绕） */
function minutesOf(hhmm) {
  var p = String(hhmm || '00:00').split(':')
  return Number(p[0]) * 60 + Number(p[1] || 0)
}

function hhmmOf(min) {
  var t = ((min % 1440) + 1440) % 1440
  return pad(Math.floor(t / 60)) + ':' + pad(t % 60)
}

function addMinutes(hhmm, dur) { return hhmmOf(minutesOf(hhmm) + Number(dur || 0)) }

/* 6×7 网格；weekStart 0=周日 1=周一 */
function monthMatrix(year, month, weekStart) {
  var ws = weekStart === 0 ? 0 : 1
  var first = new Date(year, month, 1)
  var offset = (first.getDay() - ws + 7) % 7
  var cells = []
  for (var i = 0; i < 42; i++) {
    var d = new Date(year, month, 1 - offset + i)
    cells.push({
      k: key(d),
      day: d.getDate(),
      out: d.getMonth() !== month,
      today: key(d) === todayKey()
    })
  }
  return cells
}

/* 一周 7 天；weekStart 0=周日 1=周一 */
function weekKeys(from, weekStart) {
  var base = from || todayKey()
  var d = parse(base)
  var ws = weekStart === 0 ? d.getDay() : (d.getDay() === 0 ? 6 : d.getDay() - 1)
  var start = addDays(base, -ws)
  var list = []
  for (var i = 0; i < 7; i++) list.push(addDays(start, i))
  return list
}

/* 该周的第一天（复盘按周存，用这个当 key） */
function weekStartKey(from, weekStart) {
  return weekKeys(from, weekStart)[0]
}

/* from → to 之间的所有日期（含两端） */
function rangeDays(from, to) {
  var n = diffDays(from, to)
  var list = []
  if (n < 0) return list
  for (var i = 0; i <= n; i++) list.push(addDays(from, i))
  return list
}

/* 相对今天的说法，供列表小标题用 */
function relLabel(k) {
  var n = diffDays(todayKey(), k)
  if (n === 0) return '今天'
  if (n === 1) return '明天'
  if (n === -1) return '昨天'
  if (n > 1 && n < 7) return n + ' 天后'
  if (n < -1 && n > -7) return -n + ' 天前'
  return cnDate(k)
}

module.exports = {
  pad: pad,
  key: key,
  todayKey: todayKey,
  parse: parse,
  addDays: addDays,
  diffDays: diffDays,
  weekday: weekday,
  cnDate: cnDate,
  cnMonth: cnMonth,
  minutesOf: minutesOf,
  hhmmOf: hhmmOf,
  addMinutes: addMinutes,
  monthMatrix: monthMatrix,
  weekKeys: weekKeys,
  weekStartKey: weekStartKey,
  rangeDays: rangeDays,
  relLabel: relLabel
}
