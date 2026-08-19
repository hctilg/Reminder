/**
 * Jalali (Persian) calendar conversion
 * Based on the well-known jalaali-js algorithm (MIT-style, public domain math)
 */

const div = (a,b) => (~~(a/b));
const mod = (a,b) => (a - ~~(a/b) * b);

const jalCal = jy => {
  var breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  var bl = breaks.length, gy = jy + 621, leapJ = -14, jp = breaks[0], jm, jump, leap, n, i;
  
  if (jy < jp || jy >= breaks[bl - 1]) throw new Error('سال جلالی نامعتبر: ' + jy);
  
  for (i = 1; i < bl; i += 1){
    jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }

  n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);

  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;

  var leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  var march = 20 + leapJ - leapG;
  
  if (jump - n < 6) n = n - jump + div(jump, 33) * 33;
  
  leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  
  return { leap: leap, gy: gy, march: march };
}

const g2d = (gy, gm, gd) => (
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4)
  + div(153 * mod(gm + 9, 12) + 2, 5)
  + gd - 34840408
  - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752
);

const d2g = jdn => {
  var j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  var i = div(mod(j, 1461), 4) * 5 + 308;
  var gd = div(mod(i, 153), 5) + 1;
  var gm = mod(div(i, 153), 12) + 1;
  var gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy: gy, gm: gm, gd: gd };
}

const j2d = (jy, jm, jd) => {
  var r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

const d2j = jdn => {
  var gy = d2g(jdn).gy, jy = gy - 621, r = jalCal(jy), jdn1f = g2d(gy,3,r.march);
  var jd, jm, k = jdn - jdn1f;
  
  if (k >= 0){
    if (k <= 185) {
      jm = 1 + div(k, 31);
      jd = mod(k, 31) + 1;
      return { jy: jy, jm: jm, jd: jd };
    }
    k -= 186;
  } else {
    jy -= 1; k += 179;
    if (r.leap === 1) k += 1;
  }
  
  jm = 7 + div(k, 30);
  jd = mod(k, 30) + 1;
  
  return { jy: jy, jm: jm, jd: jd };
}

const toJalaali = (gy, gm, gd) => d2j(g2d(gy, gm, gd));

const toGregorian = (jy, jm, jd) => d2g(j2d(jy, jm, jd));

const isLeapJalaaliYear = jy => (jalCal(jy).leap === 0);

const jalaaliMonthLength = (jy, jm) => {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isLeapJalaaliYear(jy) ? 30 : 29;
}

var JMONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
var PERSIAN_DIGITS = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];

const toPersianDigits = input => String(input).replace(/[0-9]/g, (d => PERSIAN_DIGITS[+d]));

const pad2 = n =>  String(n).padStart(2, '0');

const dateToJalaliParts = d => toJalaali(d.getFullYear(), d.getMonth()+1, d.getDate());

const jalaliDateTimeLabel = d => {
  var j = dateToJalaliParts(d);
  return (
    toPersianDigits(j.jy + '/' + pad2(j.jm) + '/' + pad2(j.jd)) + ' ‌ ساعت ' +
    toPersianDigits(pad2(d.getHours()) + ':' + pad2(d.getMinutes()))
  );
}

/**
 * Browser Local Storage
 */

const STORAGE_KEY = 'reminder_app_events_v1.0';

const loadEvents = () => {
  try {
    var raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch(e){ return []; }
}

const saveEvents = events => window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events));

var events = loadEvents();
var recurringCache = {}; // id -> { fields, prev, next }

/**
 * Cron-like parsing & next/previous occurrence search
 */

const parseCronField = (field, min, max) => {
  if (field === '*') return null;

  var allowed = new Set();
  var parts = field.split(',');
  for (let p = 0; p < parts.length; p++){
    var part = parts[p];
    var stepMatch = part.match(/^(\*|\d+-\d+|\d+)\/(\d+)$/);
    if (stepMatch){
      var step = parseInt(stepMatch[2],10);
      if (!step) throw new Error('گام صفر مجاز نیست');

      var baseRange = stepMatch[1], start, end;
      if (baseRange === '*'){ start = min; end = max; }
      else if (baseRange.indexOf('-') !== -1) {
        var br = baseRange.split('-').map(Number);
        start = br[0];
        end = br[1];
      } else {
        start = Number(baseRange);
        end = max;
      } for (var v = start; v <= end; v += step) allowed.add(v);
    } else if (part.indexOf('-') !== -1){
      var r = part.split('-').map(Number);
      if (r.length !== 2 || isNaN(r[0]) || isNaN(r[1]) || r[0] > r[1]) throw new Error('بازه نامعتبر: ' + part);
      for (var vv = r[0]; vv <= r[1]; vv++) allowed.add(vv);
    } else {
      var num = Number(part);
      if (isNaN(num)) throw new Error('مقدار نامعتبر: ' + part);
      allowed.add(num);
    }
  }
  
  allowed.forEach(val => {
   if (val < min || val > max) throw new Error('مقدار ' + val + ' خارج از بازه ' + min + '-' + max + ' است!');
  });

  return allowed;
}

const parseCron = str => {
  var parts = str.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error('عبارت کرون باید دقیقاً ۵ فیلد داشته باشد (دقیقه ساعت روزماه شماره‌ماه روزهفته)');
  
  return {
    minute: parseCronField(parts[4], 0, 59),
    hour:   parseCronField(parts[3], 0, 23),
    dom:    parseCronField(parts[2], 1, 31),
    month:  parseCronField(parts[1], 1, 12),
    dow:    parseCronField(parts[0], 0, 6)
  };
}

const fieldMatches = (set, val) => (set === null || set.has(val));

const nextOccurrence = (fields, from) => {
  var d = new Date(from.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);

  var domR = fields.dom !== null, dowR = fields.dow !== null;
  var iter = 0;
  while (iter++ < 200000){
    if (!fieldMatches(fields.month, d.getMonth() + 1)) {
      d.setMonth(d.getMonth() + 1, 1);
      d.setHours(0, 0, 0, 0);
      continue;
    }

    var dayOk;
    if (domR && dowR) dayOk = fields.dom.has(d.getDate()) || fields.dow.has(d.getDay());
    else if (domR) dayOk = fields.dom.has(d.getDate());
    else if (dowR) dayOk = fields.dow.has(d.getDay());
    else dayOk = true;
    
    if (!dayOk) {
      d.setDate(d.getDate() + 1);
      d.setHours(0 , 0, 0, 0);
      continue;
    }

    if (!fieldMatches(fields.hour, d.getHours())) {
      d.setHours(d.getHours() + 1, 0, 0, 0);
      continue;
    }

    if (!fieldMatches(fields.minute, d.getMinutes())) {
      d.setMinutes(d.getMinutes() + 1, 0, 0);
      continue;
    }

    return d;
  }

  return null;
}

const prevOccurrence = (fields, from) => {
  var d = new Date(from.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() - 1);

  var domR = fields.dom !== null, dowR = fields.dow !== null;
  var iter = 0;
  while (iter++ < 200000){
    if (!fieldMatches(fields.month, d.getMonth() + 1)) {
      d.setMonth(d.getMonth(), 0);
      d.setHours(23, 59, 0, 0);
      continue;
    }

    var dayOk;
    if (domR && dowR) dayOk = fields.dom.has(d.getDate()) || fields.dow.has(d.getDay());
    else if (domR) dayOk = fields.dom.has(d.getDate());
    else if (dowR) dayOk = fields.dow.has(d.getDay());
    else dayOk = true;
    
    if (!dayOk) {
      d.setDate(d.getDate() - 1);
      d.setHours(23, 59, 0, 0);
      continue;
    }

    if (!fieldMatches(fields.hour, d.getHours())) {
      d.setHours(d.getHours() - 1, 59, 0, 0);
      continue;
    }

    if (!fieldMatches(fields.minute, d.getMinutes())) {
      d.setMinutes(d.getMinutes() - 1, 0, 0);
      continue;
    }

    return d;
  }

  return null;
}

const formatDuration = ms => {
  if (ms < 0) ms = 0;

  var totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 1) return 'کمتر از یک دقیقه';

  var days = Math.floor(totalMinutes / 1440);
  var hours = Math.floor((totalMinutes % 1440) / 60);
  var minutes = totalMinutes % 60;
  var out = [];

  if (days > 0) out.push(toPersianDigits(days) + ' روز');
  if (hours > 0) out.push(toPersianDigits(hours) + ' ساعت');
  if (minutes > 0 || out.length === 0) out.push(toPersianDigits(minutes) + ' دقیقه');

  return out.join(' و ');
}

/**
 * DOM refs
 */

var titleInput = document.getElementById('titleInput');
var typeButtons = document.querySelectorAll('.type-btn');
var onceSection = document.getElementById('onceSection');
var recurringSection = document.getElementById('recurringSection');
var timeInput = document.getElementById('timeInput');
var cronInput = document.getElementById('cronInput');
var addBtn = document.getElementById('addBtn');
var formError = document.getElementById('formError');
var eventListEl = document.getElementById('eventList');
var emptyStateEl = document.getElementById('emptyState');
var nowLabel = document.getElementById('nowLabel');

var jalaliMonthSelect = document.getElementById('jalaliMonthSelect');
var jalaliYearSelect = document.getElementById('jalaliYearSelect');
var jalaliDaysGrid = document.getElementById('jalaliDaysGrid');
var prevMonthBtn = document.getElementById('prevMonthBtn');
var nextMonthBtn = document.getElementById('nextMonthBtn');
var selectedDateLabel = document.getElementById('selectedDateLabel');

var currentType = 'once';
var selectedJalali = null; // {jy,jm,jd}
var viewJalali = null;     // month currently displayed {jy,jm}

/**
 * Type toggle
 */

typeButtons.forEach(btn => btn.addEventListener('click', () => {
  typeButtons.forEach(b => { b.classList.remove('active'); });
  btn.classList.add('active');
  currentType = btn.getAttribute('data-type');
  onceSection.classList.toggle('hidden', currentType !== 'once');
  recurringSection.classList.toggle('hidden', currentType !== 'recurring');
  hideError();
}));

/**
 * Jalali picker setup
 */

var nowDate = new Date();

var minDate = new Date();
minDate.setSeconds(0, 0);

var maxDate = new Date();
maxDate.setFullYear(maxDate.getFullYear() + 2);
maxDate.setSeconds(0, 0);

var todayJalali = dateToJalaliParts(nowDate);
var minJalali = dateToJalaliParts(minDate);
var maxJalali = dateToJalaliParts(maxDate);

const jalaliCompare = (a, b) => {
  if (a.jy !== b.jy) return a.jy - b.jy;
  if (a.jm !== b.jm) return a.jm - b.jm;
  return a.jd - b.jd;
}

const populateYearSelect = () => {
  jalaliYearSelect.innerHTML = '';
  for (var y = minJalali.jy; y <= maxJalali.jy; y++){
    var opt = document.createElement('option');
    opt.value = y;
    opt.textContent = toPersianDigits(y);
    jalaliYearSelect.appendChild(opt);
  }
}

const populateMonthSelect = () => {
  jalaliMonthSelect.innerHTML = '';
  JMONTHS.forEach(function(name, idx){
    var opt = document.createElement('option');
    opt.value = idx + 1;
    opt.textContent = name;
    jalaliMonthSelect.appendChild(opt);
  });
}

function renderDaysGrid(){
jalaliDaysGrid.innerHTML = '';
var jy = viewJalali.jy, jm = viewJalali.jm;
var length = jalaaliMonthLength(jy, jm);
var firstGregorian = toGregorian(jy, jm, 1);
var firstDate = new Date(firstGregorian.gy, firstGregorian.gm-1, firstGregorian.gd);
var weekday = (firstDate.getDay() + 1) % 7; // Saturday = 0

for (var i = 0; i < weekday; i++){
    var empty = document.createElement('div');
    empty.className = 'jalali-day empty';
    jalaliDaysGrid.appendChild(empty);
}

  for (var d = 1; d <= length; d++){
    var cell = document.createElement('div');
    cell.className = 'jalali-day';
    cell.textContent = toPersianDigits(d);

    var thisJalali = { jy: jy, jm: jm, jd: d };
    var outOfRange = jalaliCompare(thisJalali, minJalali) < 0 || jalaliCompare(thisJalali, maxJalali) > 0;
    if (outOfRange) cell.classList.add('disabled');
    else {
      cell.addEventListener('click', (
        jVal => (() => {
          selectedJalali = jVal;
          renderDaysGrid();
          updateSelectedLabel();
        }))(thisJalali)
      );
    }

    if (jalaliCompare(thisJalali, todayJalali) === 0)
      cell.classList.add('today');

    if (selectedJalali && jalaliCompare(thisJalali, selectedJalali) === 0)
      cell.classList.add('selected');

    jalaliDaysGrid.appendChild(cell);
  }

  jalaliMonthSelect.value = jm;
  jalaliYearSelect.value = jy;
}

const updateSelectedLabel = () => {
  if (!selectedJalali){
    selectedDateLabel.textContent = 'هنوز روزی انتخاب نشده — بازه مجاز از امروز تا دو سال آینده است.';
    return;
  }
  
  selectedDateLabel.innerHTML = 'روز انتخاب‌شده: <b>' +
    toPersianDigits(selectedJalali.jy + '/' + pad2(selectedJalali.jm) + '/' + pad2(selectedJalali.jd)) +
    '</b>';
}

const clampViewToRange = () => {
  if (jalaliCompare(viewJalali, minJalali) < 0) viewJalali = { jy: minJalali.jy, jm: minJalali.jm };
  if (jalaliCompare(viewJalali, maxJalali) > 0) viewJalali = { jy: maxJalali.jy, jm: maxJalali.jm };
}

prevMonthBtn.addEventListener('click', () => {
  viewJalali.jm -= 1;
  if (viewJalali.jm < 1){ viewJalali.jm = 12; viewJalali.jy -= 1; }
  clampViewToRange();
  renderDaysGrid();
});

nextMonthBtn.addEventListener('click', () => {
viewJalali.jm += 1;
  if (viewJalali.jm > 12) { viewJalali.jm = 1; viewJalali.jy += 1; }
  clampViewToRange();
  renderDaysGrid();
});

jalaliMonthSelect.addEventListener('change', () => {
  viewJalali.jm = parseInt(jalaliMonthSelect.value, 10);
  clampViewToRange();
  renderDaysGrid();
});

jalaliYearSelect.addEventListener('change', () => {
  viewJalali.jy = parseInt(jalaliYearSelect.value, 10);
  clampViewToRange();
  renderDaysGrid();
});

populateYearSelect();
populateMonthSelect();
viewJalali = { jy: todayJalali.jy, jm: todayJalali.jm };
renderDaysGrid();
updateSelectedLabel();

/**
 * Cron presets
 */

document.querySelectorAll('.cron-presets button').forEach(btn => {
  btn.addEventListener('click', () => {
    cronInput.value = btn.getAttribute('data-cron');
    hideError();
  });
});

/**
 * Add/Delete event
 */

const showError = msg => {
  formError.textContent = msg;
  formError.classList.remove('hidden');
}

const hideError = () => formError.classList.add('hidden');

addBtn.addEventListener('click', () => {
  hideError();
  var title = titleInput.value.trim();
  if (!title) {
    showError("عنوان رویداد را وارد کن!");
    return;
  }
  
  if (currentType === 'once'){
    if (!selectedJalali) {
      showError("یک روز از تقویم انتخاب کن!");
      return;
    }
    
    var timeVal = timeInput.value;
    if (!timeVal){
      showError("ساعت را مشخص کن!");
      return;
    }

    var hm = timeVal.split(':').map(Number);
    var g = toGregorian(selectedJalali.jy, selectedJalali.jm, selectedJalali.jd);
    var finalDate = new Date(g.gy, g.gm-1, g.gd, hm[0], hm[1], 0, 0);
    var nowCheck = new Date();
    var maxCheck = new Date();
    
    maxCheck.setFullYear(maxCheck.getFullYear() + 2);

    if (finalDate.getTime() < nowCheck.getTime()) {
      showError("زمان انتخاب‌شده در گذشته است!");
      return;
    }

    if (finalDate.getTime() > maxCheck.getTime()) {
      showError("زمان انتخاب‌شده بیش از دو سال آینده است!");
      return;
    }

    events.push({
      id: 'e' + Date.now() + Math.random().toString(36).slice(2, 7),
      title: title,
      type: 'once',
      timestamp: finalDate.getTime()
    });

  } else {
    var cronStr = cronInput.value.trim();
    if (!cronStr) {
      showError("عبارت کرون را وارد کن!");
      return;
    }
    
    try {
      parseCron(cronStr); // validate
    } catch(err) {
      showError(err.message);
      return;
    }

    events.push({
      id: 'e' + Date.now() + Math.random().toString(36).slice(2, 7),
      title: title,
      type: 'recurring',
      cron: cronStr
    });
  }

  saveEvents(events);
  titleInput.value = '';
  cronInput.value = '';
  selectedJalali = null;
  renderDaysGrid();
  updateSelectedLabel();
  renderEvents();
});

const deleteEvent = id => {
  events = events.filter(e => (e.id !== id));
  delete recurringCache[id];
  saveEvents(events);
  renderEvents();
}

/**
 * Rendering event list
 */

const computeOnceStatus = (ev, now) => {
  var evMinute = Math.floor(ev.timestamp / 60000);
  var nowMinute = Math.floor(now.getTime() / 60000);
  if (nowMinute < evMinute) return 'gray';
  if (nowMinute === evMinute) return 'green';
  return 'red';
}

const getRecurringTiming = (ev, now) => {
  var cache = recurringCache[ev.id];
  if (!cache || cache.cronStr !== ev.cron){
    var fields;
    try { fields = parseCron(ev.cron); }
    catch(e){ fields = null; }
    
    cache = { cronStr: ev.cron, fields: fields, prev: null, next: null };

    if (fields) {
      cache.prev = prevOccurrence(fields, now);
      cache.next = nextOccurrence(fields, now);
    }

    recurringCache[ev.id] = cache;
  } else if (cache.fields && cache.next && now.getTime() >= cache.next.getTime()) {
    cache.prev = cache.next;
    cache.next = nextOccurrence(cache.fields, now);
  }

  return cache;
}

const renderEvents = () => {
  var now = new Date();
  eventListEl.innerHTML = '';
  if (events.length === 0){
    emptyStateEl.classList.remove('hidden');
    return;
  }
  emptyStateEl.classList.add('hidden');

  var sorted = events.slice().sort((a, b) => {
    var ta = a.type === 'once' ? a.timestamp : (getRecurringTiming(a, now).next ? getRecurringTiming(a, now).next.getTime() : Infinity);
    var tb = b.type === 'once' ? b.timestamp : (getRecurringTiming(b, now).next ? getRecurringTiming(b, now).next.getTime() : Infinity);
    return ta - tb;
  });

  sorted.forEach(ev => {
    var li = document.createElement('li');
    li.className = 'event-card';

    if (ev.type === 'once'){
      var status = computeOnceStatus(ev, now);
      var orb = document.createElement('div');
      orb.className = 'status-orb ' + status;
      li.appendChild(orb);

      var body = document.createElement('div');
      body.className = 'event-body';
      var titleEl = document.createElement('p');
      titleEl.className = 'event-title';
      titleEl.textContent = ev.title;
      var metaEl = document.createElement('div');
      metaEl.className = 'event-meta';
      var d = new Date(ev.timestamp);
      var statusText = status === 'gray' ? 'در انتظار' : (status === 'green' ? 'همین الان' : 'گذشته');
      metaEl.innerHTML = '<span>' + jalaliDateTimeLabel(d) + '</span><span>وضعیت: ' + statusText + '</span>';
      body.appendChild(titleEl);
      body.appendChild(metaEl);
      li.appendChild(body);
    } else {
      var timing = getRecurringTiming(ev, now);
      var orbR = document.createElement('div');
      orbR.className = 'status-orb white';
      li.appendChild(orbR);

      var ringWrap = document.createElement('div');
      ringWrap.className = 'ring-wrap';
      var pct = 0;

      if (timing.prev && timing.next){
        var total = timing.next.getTime() - timing.prev.getTime();
        var passed = now.getTime() - timing.prev.getTime();
        pct = total > 0 ? Math.max(0, Math.min(1, passed/total)) : 0;
      }

      var circumference = 2 * Math.PI * 17;
      var offset = circumference * (1 - pct);
      ringWrap.innerHTML =
        '<svg width="42" height="42" viewBox="0 0 42 42">' +
          '<circle class="ring-bg" cx="21" cy="21" r="17"></circle>' +
          '<circle class="ring-fg" cx="21" cy="21" r="17" stroke-dasharray="' + circumference + '" stroke-dashoffset="' + offset + '"></circle>' +
        '</svg>';
      li.appendChild(ringWrap);

      var bodyR = document.createElement('div');
      bodyR.className = 'event-body';
      var titleR = document.createElement('p');
      titleR.className = 'event-title';
      titleR.textContent = ev.title;
      var metaR = document.createElement('div');
      metaR.className = 'event-meta';
      metaR.innerHTML = '<span class="cron-tag">' + ev.cron + '</span>';
      var subR = document.createElement('div');
      subR.className = 'event-sub';
        
      if (!timing.fields){
        subR.innerHTML = '<span style="color:var(--red)">عبارت کرون نامعتبر است</span>';
      } else {
        var elapsedTxt = timing.prev ? formatDuration(now.getTime() - timing.prev.getTime()) : 'هنوز رخ نداده';
        var remainTxt = timing.next ? formatDuration(timing.next.getTime() - now.getTime()) : 'یافت نشد';
        subR.innerHTML =
        '<span>زمان گذشته: <b>' + elapsedTxt + '</b></span>' +
        '<span>زمان باقی‌مانده: <b>' + remainTxt + '</b></span>';
      }

      bodyR.appendChild(titleR);
      bodyR.appendChild(metaR);
      bodyR.appendChild(subR);
      li.appendChild(bodyR);
    }

    var delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.title = ' حذف ';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', function(){ deleteEvent(ev.id); });
    li.appendChild(delBtn);

    eventListEl.appendChild(li);
  });
}

/**
 * Clock
 */

let tick_uid, now;
const tick = () => {
  now = new Date();
  nowLabel.textContent = jalaliDateTimeLabel(now);
  renderEvents();
  if (tick_uid == undefined) tick_uid = setInterval(tick, 1000);
}

tick();