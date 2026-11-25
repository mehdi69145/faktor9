import { all, get, put, del, getSetting, setSetting, exportAll, importAll } from './db.js';
import { toFa, num, fmt, rial, esc, words, showDate, longDate, isoToday, isoToJ, jToIso, parseJ, MONTHS, jMonthKey } from './util.js';

const $ = s => document.querySelector(s), view = $('#view');
const loaded = {};
const loadScript = (src, ready) => ready() || loaded[src] || (loaded[src] = new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = src; sc.onload = res; sc.onerror = () => rej(new Error(src)); document.head.append(sc); }));
const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 2200); };
const sheet = html => new Promise(res => { const d = document.createElement('div'); d.className = 'dlg'; d.innerHTML = `<div>${html}</div>`; d.onclick = e => { if (e.target === d) { d.remove(); res(null); } }; document.body.append(d); d.close = v => { d.remove(); res(v); }; d.res = res; sheet.cur = d; });
const confirmBox = msg => { const p = sheet(`<h3>${msg}</h3><div class="btns"><button class="btn red" id="y">بله</button><button class="btn sec" id="n">انصراف</button></div>`); const d = sheet.cur; d.querySelector('#y').onclick = () => d.close(true); d.querySelector('#n').onclick = () => d.close(false); return p; };
const ask = confirmBox;
// فیلدهای عددی: با لمس، مقدار قبلی پاک می‌شود تا مستقیم عدد جدید تایپ شود؛ اگر خالی رها شد مقدار قبلی برمی‌گردد. تاریخ و شماره‌ی فاکتور فقط انتخاب‌همه می‌شوند.
document.addEventListener('focusin', e => {
  const t = e.target, m = t.tagName === 'INPUT' && t.getAttribute('inputmode');
  if (m !== 'numeric' && m !== 'decimal') return;
  if (t.id === 'date' || t.id === 'no') return void setTimeout(() => t.select(), 0);
  t.dataset.old = t.value; t.value = '';
});
document.addEventListener('focusout', e => {
  const t = e.target;
  if (t.dataset && t.dataset.old !== undefined) { if (t.value === '') t.value = t.dataset.old; delete t.dataset.old; }
});

function chrome({ title, back, fab, act } = {}) {
  $('#title').textContent = title || 'فاکتورساز';
  $('#back').hidden = !back; $('#back').onclick = () => (typeof back === 'string' ? (location.hash = back) : history.back());
  $('#fab').hidden = !fab; $('#fab').onclick = fab || null;
  $('#topact').innerHTML = act ? `<button>${act.label}</button>` : ''; if (act) $('#topact button').onclick = act.fn;
}
// ---------- فروشگاه‌ها (چند کسب‌وکار) ----------
const shops = async () => {
  let l = await getSetting('shops');
  if (!l) { const old = await getSetting('biz', {}); l = [{ id: 's1', name: 'فروشگاه من', ...old }]; await setSetting('shops', l); await setSetting('activeShop', 's1'); }
  return l;
};
const activeShop = async () => { const l = await shops(); const id = await getSetting('activeShop', l[0].id); return l.find(x => x.id === id) || l[0]; };
const shopById = async id => { const l = await shops(); return l.find(x => x.id === id) || activeShop(); };
const inShop = (i, sh) => (i.shopId || 's1') === sh.id;
const toBW = (file, cb) => { const img = new Image(); img.onload = () => { const k = Math.min(1, 400 / img.width), c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k; const x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height); const d = x.getImageData(0, 0, c.width, c.height), a = d.data; for (let i = 0; i < a.length; i += 4) { const g = 0.3 * a[i] + 0.59 * a[i + 1] + 0.11 * a[i + 2]; const ink = g < 150 && a[i + 3] > 40; a[i] = a[i + 1] = a[i + 2] = 0; a[i + 3] = ink ? 255 : 0; } x.putImageData(d, 0, 0); cb(c.toDataURL('image/png')); }; img.src = URL.createObjectURL(file); };
const readLogo = (file, cb) => { const img = new Image(); img.onload = () => { const k = Math.min(1, 300 / img.width), c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); cb(c.toDataURL('image/png')); }; img.src = URL.createObjectURL(file); };
const empty = (i, t) => `<div class="empty"><b>${i}</b>${t}</div>`;

/* ---------- مشتریان ---------- */
async function customers() {
  chrome({ title: 'مشتریان', fab: () => (location.hash = '#/customer/new') });
  const list = (await all('customers')).sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  view.innerHTML = `<input class="search" id="q" placeholder="جستجوی نام یا تلفن…"><div id="l"></div>`;
  const draw = q => { const r = list.filter(c => (c.name + c.phone).includes(q)); $('#l').innerHTML = r.length ? r.map(c => `<a class="card item" href="#/customer/${c.id}"><div class="big">${esc(c.name)}</div><div class="sub">${toFa(esc(c.phone || ''))} ${c.address ? '· ' + esc(c.address) : ''}</div></a>`).join('') : empty('👥', 'مشتری‌ای ثبت نشده'); };
  draw(''); $('#q').oninput = e => draw(e.target.value);
}
const mapUrl = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`;
const geoErr = e => e?.code === 1 ? 'دسترسی به موقعیت رد شد؛ در تنظیمات مرورگر اجازه بدهید' : e?.code === 3 ? 'دریافت موقعیت طول کشید؛ GPS را روشن کنید و جای بازتری امتحان کنید' : 'موقعیت در دسترس نیست';
// موقعیت فعلی را از GPS می‌گیرد؛ اگر آنلاین باشیم آدرس متنی را هم از OpenStreetMap (Nominatim) حدس می‌زند. مختصات همیشه آفلاین هم ذخیره می‌شود.
async function whereAmI() {
  if (!navigator.geolocation) throw { code: 2 };
  const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }));
  const { latitude: lat, longitude: lng, accuracy } = pos.coords;
  let text = '';
  try {
    const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 8000);
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=fa&lat=${lat}&lon=${lng}`, { signal: ac.signal });
    clearTimeout(tm);
    const j = await r.json(), a = j.address || {};
    text = [a.state, a.city || a.town || a.village || a.county, a.suburb || a.neighbourhood || a.city_district, a.road, a.house_number && 'پلاک ' + toFa(a.house_number)].filter((x, i, arr) => x && x !== arr[i - 1]).join('، ') || j.display_name || '';
  } catch { /* آفلاین یا بلاک: فقط مختصات */ }
  return { lat: +lat.toFixed(6), lng: +lng.toFixed(6), acc: Math.round(accuracy), text };
}

async function customerForm(id) {
  const c = id === 'new' ? {} : await get('customers', +id);
  if (!c) return (location.hash = '#/customers');
  chrome({ title: id === 'new' ? 'مشتری جدید' : 'ویرایش مشتری', back: '#/customers' });
  view.innerHTML = `<div class="card"><label>نام مشتری *<input id="name" value="${esc(c.name || '')}"></label><label>تلفن<input id="phone" inputmode="tel" value="${esc(c.phone || '')}"></label><div><b style="font-size:.9rem">آدرس‌ها</b><div id="adrs"></div><button class="btn sec" id="addA" type="button" style="margin-top:6px">＋ آدرس جدید</button></div><label>کد ملی / شناسه اقتصادی<input id="nid" value="${esc(c.nid || '')}"></label></div><button class="btn" id="s">ذخیره</button>${c.id ? '<br><button class="btn red" id="d">حذف مشتری</button>' : ''}`;
  let addrs = c.addresses?.length ? c.addresses.map(a => ({ ...a })) : (c.address ? [{ label: '', text: c.address }] : [{ label: '', text: '' }]);
  const readA = () => { document.querySelectorAll('#adrs .adr').forEach((el, i) => { addrs[i].label = el.querySelector('.al').value; addrs[i].text = el.querySelector('.at').value; }); };
  const drawA = () => {
    $('#adrs').innerHTML = addrs.map((a, i) => `<div class="adr card" style="margin:8px 0;padding:10px"><div class="row" style="gap:6px"><input class="al" placeholder="برچسب مثل: مغازه، خانه" value="${esc(a.label)}" style="flex:1"><button class="btn red" type="button" data-rm="${i}" style="width:auto;padding:8px 12px;margin:0">✕</button></div><textarea class="at" rows="2" placeholder="متن آدرس">${esc(a.text)}</textarea><button class="btn sec" type="button" data-loc="${i}" style="margin:6px 0 0;padding:9px;font-size:14px">📍 ثبت موقعیت فعلی (GPS)</button>${a.lat != null ? `<div class="sub">📌 <bdi dir="ltr">${a.lat}, ${a.lng}</bdi> (دقت ±${toFa(a.acc || 0)} متر) · <a href="${mapUrl(a.lat, a.lng)}" target="_blank" rel="noopener">نقشه</a> · <a href="#" data-clr="${i}">حذف موقعیت</a></div>` : ''}</div>`).join('');
    document.querySelectorAll('#adrs [data-loc]').forEach(b => b.onclick = async () => {
      readA(); const i = +b.dataset.loc; b.disabled = true; b.textContent = 'در حال دریافت موقعیت…';
      try {
        const p = await whereAmI(); readA();
        Object.assign(addrs[i], { lat: p.lat, lng: p.lng, acc: p.acc });
        if (p.text && !addrs[i].text.trim()) addrs[i].text = p.text;
        toast(p.text ? 'موقعیت و آدرس ثبت شد؛ متن آدرس را بررسی کنید' : 'موقعیت ثبت شد (آدرس متنی را خودتان بنویسید)');
      } catch (e) { toast(geoErr(e)); }
      drawA();
    });
    document.querySelectorAll('#adrs [data-clr]').forEach(a => a.onclick = ev => { ev.preventDefault(); readA(); const x = addrs[+a.dataset.clr]; delete x.lat; delete x.lng; delete x.acc; drawA(); });
    document.querySelectorAll('#adrs [data-rm]').forEach(b => b.onclick = () => { readA(); addrs.splice(+b.dataset.rm, 1); if (!addrs.length) addrs.push({ label: '', text: '' }); drawA(); });
  };
  drawA();
  $('#addA').onclick = () => { readA(); addrs.push({ label: '', text: '' }); drawA(); };
  $('#s').onclick = async () => { const name = $('#name').value.trim(); if (!name) return toast('نام را وارد کنید'); readA(); const addresses = addrs.map(a => ({ label: a.label.trim(), text: a.text.trim(), ...(a.lat != null ? { lat: a.lat, lng: a.lng, acc: a.acc } : {}) })).filter(a => a.text || a.lat != null); await put('customers', { ...c, name, phone: $('#phone').value.trim(), addresses, address: addresses[0]?.text || '', nid: $('#nid').value.trim() }); toast('ذخیره شد'); location.hash = '#/customers'; };
  if (c.id) view.insertAdjacentHTML('beforeend', `<a class="btn sec" href="#/customer/${c.id}/report" style="margin-top:10px">📊 گزارش مشتری</a>`);
  if (c.id) $('#d').onclick = async () => { if (await ask('این مشتری حذف شود؟')) { await del('customers', c.id); location.hash = '#/customers'; } };
}

/* ---------- کالاها ---------- */
async function customerReport(id) {
  const c = await get('customers', +id);
  if (!c) return (location.hash = '#/customers');
  chrome({ title: 'گزارش مشتری', back: '#/customer/' + id });
  const addrs = c.addresses?.length ? c.addresses : (c.address ? [{ label: '', text: c.address }] : []);
  const list = (await all('invoices')).filter(i => String(i.customerId) === String(c.id) || (!i.customerId && i.customerName === c.name)).sort((x, y) => (y.date || '').localeCompare(x.date || ''));
  const t = list.reduce((o, i) => { const k = calc(i); o.total += k.total; o.paid += Math.min(k.paid, k.total); o.due += Math.max(0, k.due); return o; }, { total: 0, paid: 0, due: 0 });
  view.innerHTML = `<div class="card"><b class="big">${esc(c.name)}</b>${c.phone ? `<div class="sub">${toFa(esc(c.phone))}</div>` : ''}
    <div class="sub" style="margin-top:8px"><b>آدرس‌ها</b></div>
    ${addrs.length ? addrs.map(a => `<div style="padding:4px 0">${a.label ? `<span class="badge">${esc(a.label)}</span> ` : ''}${esc(a.text)}${a.lat != null ? ` <a href="${mapUrl(a.lat, a.lng)}" target="_blank" rel="noopener">📍 نقشه</a>` : ''}</div>`).join('') : '<div class="sub">آدرسی ثبت نشده</div>'}
  </div>
  <div class="card"><div class="row" style="padding:3px 0"><span>تعداد فاکتور</span><b>${toFa(list.length)}</b></div>
    <div class="row" style="padding:3px 0"><span>جمع خرید</span><b>${rial(t.total)}</b></div>
    <div class="row" style="padding:3px 0"><span>دریافتی</span><b>${rial(t.paid)}</b></div>
    <div class="row" style="padding:3px 0"><span>مانده بدهی</span><b>${rial(t.due)}</b></div></div>
  <div class="sub" style="margin:8px 4px">فاکتورها</div>
  ${list.length ? list.map(i => `<a class="card item" href="#/invoice/${i.id}/view"><div class="big">فاکتور ${toFa(i.number)} · ${showDate(i.date)}</div><div class="sub">${rial(calc(i).total)} · ${status(i)[1]}</div></a>`).join('') : empty('🧾', 'فاکتوری برای این مشتری نیست')}`;
}
async function products() {
  chrome({ title: 'کالاها و خدمات', fab: () => (location.hash = '#/product/new') });
  const list = (await all('products')).sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  view.innerHTML = `<input class="search" id="q" placeholder="جستجوی کالا…"><div id="l"></div>`;
  const draw = q => { const r = list.filter(p => p.name.includes(q)); $('#l').innerHTML = r.length ? r.map(p => `<a class="card item" href="#/product/${p.id}"><div class="row"><div class="big">${esc(p.name)}</div><div>${rial(p.price)}</div></div><div class="sub">واحد: ${esc(p.unit || 'عدد')}</div></a>`).join('') : empty('📦', 'کالایی ثبت نشده'); };
  draw(''); $('#q').oninput = e => draw(e.target.value);
}
const TPLS = [['classic', 'ساده'], ['wave', 'موج (سربرگ رنگی گرد)'], ['slant', 'شیب (سربرگ مورب)'], ['band', 'نوار کناری'], ['geo', 'هندسی (لوزی گوشه)'], ['persian', 'گره ایرانی'], ['ledger', 'دفتر حساب'], ['modern', 'مدرن (سربرگ رنگی)'], ['formal', 'رسمی (قاب دوتایی)'], ['minimal', 'خلوت (مینیمال)'], ['elegant', 'مجلسی (شیک)'], ['bold', 'شلوغ (نوار تیره)'], ['emerald', 'سبز شیک (طرح ۲)'], ['luxe', 'لوکس (کرم و طلایی)']];
const tplHidden = async () => (await getSetting('hiddenTpls', [])) || [];
const tplVisible = async (cur) => { const h = await tplHidden(); return TPLS.filter(([v]) => !h.includes(v) || v === cur); };
const COLORS = [['#0f766e', 'سبز دریایی'], ['#1d4ed8', 'آبی'], ['#7c3aed', 'بنفش'], ['#b91c1c', 'قرمز'], ['#92400e', 'قهوه‌ای'], ['#111827', 'مشکی'], ['#0e7490', 'فیروزه‌ای'], ['#be185d', 'صورتی'], ['#c2410c', 'نارنجی'], ['#15803d', 'سبز'], ['#1e3a8a', 'سرمه‌ای'], ['#a16207', 'طلایی']];
const UNITS = ['عدد', 'متر', 'متر مربع', 'متر مکعب', 'کیلوگرم', 'گرم', 'لیتر', 'ساعت', 'روز', 'ماه', 'جلسه', 'بسته', 'کارتن', 'جفت', 'سرویس'];
const unitSel = (v, attrs = '') => { v = v || 'عدد'; const l = UNITS.includes(v) ? UNITS : [...UNITS, v]; return `<select ${attrs}>${l.map(u => `<option${u === v ? ' selected' : ''}>${esc(u)}</option>`).join('')}<option value="__new">+ واحد دیگر…</option></select>`; };
const unitPick = (el, cb) => { if (el.value !== '__new') return cb && cb(el.value); const u = (prompt('نام واحد را بنویسید') || '').trim(); if (u) { el.insertBefore(new Option(u, u), el.lastElementChild); el.value = u; } else el.value = 'عدد'; cb && cb(el.value); };

async function productForm(id) {
  const p = id === 'new' ? {} : await get('products', +id);
  if (!p) return (location.hash = '#/products');
  chrome({ title: id === 'new' ? 'کالای جدید' : 'ویرایش کالا', back: '#/products' });
  view.innerHTML = `<div class="card"><label>نام کالا / خدمت *<input id="name" value="${esc(p.name || '')}"></label><div class="g2"><label>قیمت واحد (ریال)<input id="price" inputmode="numeric" value="${p.price ? fmt(p.price) : ''}"></label><label>واحد${unitSel(p.unit, 'id="unit"')}</label></div></div><button class="btn" id="s">ذخیره</button>${p.id ? '<br><button class="btn red" id="d">حذف</button>' : ''}`;
  $('#unit').onchange = e => unitPick(e.target);
  $('#price').oninput = e => { const n = num(e.target.value); e.target.value = n ? fmt(n) : ''; };
  $('#s').onclick = async () => { const name = $('#name').value.trim(); if (!name) return toast('نام را وارد کنید'); await put('products', { ...p, name, price: num($('#price').value), unit: $('#unit').value }); toast('ذخیره شد'); location.hash = '#/products'; };
  if (p.id) $('#d').onclick = async () => { if (await ask('این کالا حذف شود؟')) { await del('products', p.id); location.hash = '#/products'; } };
}

/* ---------- فاکتورها ---------- */
const calc = inv => { const sub = inv.items.reduce((s, i) => s + Math.round(i.qty * i.price), 0); const disc = Math.min(inv.discount || 0, sub); const tax = Math.round((sub - disc) * (inv.taxRate || 0) / 100); const total = sub - disc + tax; const paid = inv.paid || 0; return { sub, disc, tax, total, paid, due: total - paid }; };
const status = inv => { const t = calc(inv); return t.due <= 0 ? ['paid', 'پرداخت‌شده'] : t.paid > 0 ? ['part', 'پرداخت ناقص'] : ['unpaid', 'پرداخت‌نشده']; };

async function invoices() {
  chrome({ title: 'فاکتورها', fab: () => (location.hash = '#/invoice/new') });
  const sh = await activeShop(), sl = await shops();
  const list = (await all('invoices')).filter(i => inShop(i, sh)).sort((a, b) => b.number - a.number);
  view.innerHTML = `<select id="sw">${sl.map(x => `<option value="${x.id}" ${x.id === sh.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select><input class="search" id="q" placeholder="جستجوی مشتری، شماره یا مبلغ…"><div class="g2"><select id="fs"><option value="">همه وضعیت‌ها</option><option value="paid">پرداخت‌شده</option><option value="part">پرداخت ناقص</option><option value="unpaid">پرداخت‌نشده</option></select><select id="fk"><option value="">فاکتور و پیش‌فاکتور</option><option value="invoice">فقط فاکتور</option><option value="proforma">فقط پیش‌فاکتور</option></select></div><div class="sub" id="cnt" style="margin:8px 0"></div><div id="l"></div>`;
  $('#sw').onchange = async e => { await setSetting('activeShop', e.target.value); invoices(); };
  const draw = () => {
    const q = $('#q').value.trim().replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[,٬،]/g, '');
    const fs = $('#fs').value, fk = $('#fk').value;
    const r = list.filter(i => {
      if (fk && (i.kind === 'proforma' ? 'proforma' : 'invoice') !== fk) return false;
      if (fs && status(i)[0] !== fs) return false;
      if (!q) return true;
      return (i.customerName || '').includes(q) || String(i.number).includes(q) || toFa(i.number).includes(q) || String(calc(i).total).includes(q) || (i.customerAddress || '').includes(q);
    });
    $('#cnt').textContent = `${toFa(r.length)} مورد`;
    let last = '';
    $('#l').innerHTML = r.length ? r.map(i => {
      const k = jMonthKey(i.date), head = k !== last ? `<div class="sub" style="margin:14px 4px 6px;font-weight:700">${MONTHS[k % 100 - 1]} ${toFa(~~(k / 100))}</div>` : '';
      last = k;
      const [c, l] = status(i);
      return `${head}<a class="card item" href="#/invoice/${i.id}" style="padding:10px 12px;margin:6px 0"><div class="row"><b>${toFa(i.number)} · ${esc(i.customerName || 'بدون نام')}</b><b>${rial(calc(i).total)}</b></div><div class="row sub" style="margin-top:4px"><span>${showDate(i.date)}${i.kind === 'proforma' ? ' · پیش‌فاکتور' : ''}</span>${c !== 'unpaid' ? `<span class="badge ${c}">${l}</span>` : ''}</div></a>`;
    }).join('') : empty('🧾', 'هنوز فاکتوری نساخته‌اید<br>با دکمه + شروع کنید'); };
  draw(); $('#q').oninput = draw; $('#fs').onchange = draw; $('#fk').onchange = draw;
}

async function invoiceForm(id) {
  const settings = await activeShop();
  let inv;
  if (id === 'new') { const nums = (await all('invoices')).filter(i => inShop(i, settings)).map(i => i.number); inv = { shopId: settings.id, number: Math.max(settings.startNo ? settings.startNo - 1 : 0, ...nums, 0) + 1, date: isoToday(), customerId: null, customerName: '', items: [{ name: '', qty: 1, price: 0, unit: 'عدد' }], discount: 0, taxRate: settings.defTax || 0, paid: 0, note: '', kind: 'invoice', template: 'classic', color: '#0f766e' }; }
  else inv = await get('invoices', +id);
  if (!inv) return (location.hash = '#/invoices');
  chrome({ title: id === 'new' ? 'فاکتور جدید' : 'ویرایش فاکتور ' + toFa(inv.number), back: true });
  const custs = await all('customers'), prods = await all('products');
  const tplList = await tplVisible(inv.template || 'classic');
  const [jy, jm, jd] = isoToJ(inv.date);
  view.innerHTML = `
  <div class="card"><div class="g2"><label>شماره<input id="no" inputmode="numeric" value="${toFa(inv.number)}"></label><label>تاریخ (شمسی)<input id="date" inputmode="numeric" value="${showDate(inv.date)}"></label></div>
  <label>مشتری<div class="row" style="gap:6px"><input id="cn" placeholder="نام مشتری" value="${esc(inv.customerName)}"><button class="btn sec" id="pc" style="width:auto;padding:10px 14px;margin-top:4px">انتخاب</button></div></label><label>آدرس مشتری<textarea id="ca" rows="2" placeholder="اختیاری">${esc(inv.customerAddress || '')}</textarea></label><button class="btn sec" id="pa" type="button" style="margin-top:6px">📍 انتخاب از آدرس‌های مشتری</button><button class="btn sec" id="ph" type="button" style="margin-top:6px">📡 ثبت آدرس از موقعیت فعلی (GPS)</button></div>
  <div class="card"><div class="g3"><label>نوع سند<select id="kind"><option value="invoice"${inv.kind !== 'proforma' ? ' selected' : ''}>فاکتور</option><option value="proforma"${inv.kind === 'proforma' ? ' selected' : ''}>پیش‌فاکتور</option></select></label><label>قالب<select id="tpl">${tplList.map(([v, n]) => `<option value="${v}"${(inv.template || 'classic') === v ? ' selected' : ''}>${n}</option>`).join('')}</select></label><label>رنگ<select id="color">${COLORS.map(([v, n]) => `<option value="${v}"${(inv.color || '#0f766e') === v ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div><button class="btn sec" id="gal" type="button" style="margin-top:4px">🎨 مرور قالب‌ها با پیش‌نمایش زنده</button></div>
  <h3>اقلام</h3><div id="items"></div>
  <button class="btn sec" id="add">+ افزودن ردیف</button><br><button class="btn sec" id="addp">📦 افزودن از لیست کالا</button><br>
  <div class="card"><div class="g2"><label>تخفیف (ریال)<input id="disc" inputmode="numeric" value="${inv.discount ? fmt(inv.discount) : ''}"></label><label>مالیات بر ارزش افزوده (٪)<input id="tax" inputmode="numeric" value="${toFa(inv.taxRate || 0)}"></label></div>
  <label>مبلغ پرداخت‌شده (ریال)<input id="paid" inputmode="numeric" value="${inv.paid ? fmt(inv.paid) : ''}"></label>
  <label>توضیحات<textarea id="note" rows="2">${esc(inv.note || '')}</textarea></label></div>
  <div class="card tot" id="tot"></div><button class="btn" id="save">ذخیره فاکتور</button>`;
  const itemsEl = $('#items');
  const drawItems = () => { itemsEl.innerHTML = inv.items.map((it, k) => `<div class="line"><div class="row"><input data-k="${k}" data-f="name" placeholder="شرح کالا / خدمت" value="${esc(it.name)}"><button class="x" data-del="${k}">✕</button></div><div class="g3" style="margin-top:6px"><label>تعداد<input data-k="${k}" data-f="qty" inputmode="decimal" value="${toFa(it.qty)}"></label><label>واحد${unitSel(it.unit, `data-k="${k}" data-f="unit"`)}</label><label>قیمت واحد<input data-k="${k}" data-f="price" inputmode="numeric" value="${it.price ? fmt(it.price) : ''}"></label></div><div class="sub" style="text-align:left">جمع: ${rial(it.qty * it.price)}</div></div>`).join(''); };
  const readTop = () => { inv.customerName = $('#cn').value.trim(); inv.customerAddress = $('#ca').value.trim(); inv.discount = num($('#disc').value); inv.taxRate = num($('#tax').value); inv.paid = num($('#paid').value); inv.note = $('#note').value; inv.kind = $('#kind').value; inv.template = $('#tpl').value; inv.color = $('#color').value; };
  const totals = () => { readTop(); const t = calc(inv); $('#tot').innerHTML = `<div><span>جمع اقلام</span><span>${rial(t.sub)}</span></div><div><span>تخفیف</span><span>${rial(t.disc)}</span></div><div><span>مالیات (${toFa(inv.taxRate)}٪)</span><span>${rial(t.tax)}</span></div><div class="gt"><span>مبلغ قابل پرداخت</span><span>${rial(t.total)}</span></div><div class="words">${inv.template === 'emerald' ? '<b>مبلغ کل به حروف:</b> ' : ''}${words(t.total)} ریال</div><div><span>مانده</span><span style="color:${t.due > 0 ? 'var(--red)' : 'var(--ok)'}">${rial(t.due)}</span></div>`; };
  drawItems(); totals();
  itemsEl.addEventListener('input', e => { const { k, f } = e.target.dataset; if (k === undefined) return; const it = inv.items[k]; if (f === 'unit') return; if (f === 'name') it.name = e.target.value; else { it[f] = num(e.target.value); if (f === 'price') { const v = it.price; e.target.value = v ? fmt(v) : ''; } e.target.closest('.line').querySelector('.sub').textContent = 'جمع: ' + rial(it.qty * it.price); } totals(); });
  itemsEl.addEventListener('change', e => { const { k, f } = e.target.dataset; if (f === 'unit') unitPick(e.target, v => { inv.items[k].unit = v; }); });
  itemsEl.addEventListener('click', e => { const k = e.target.dataset.del; if (k === undefined) return; inv.items.splice(k, 1); if (!inv.items.length) inv.items.push({ name: '', qty: 1, price: 0, unit: 'عدد' }); drawItems(); totals(); });
  ['disc', 'paid'].forEach(i => $('#' + i).addEventListener('input', e => { const n = num(e.target.value); e.target.value = n ? fmt(n) : ''; totals(); }));
  ['tax', 'cn', 'ca', 'note'].forEach(i => $('#' + i).addEventListener('input', totals));
  $('#add').onclick = () => { inv.items.push({ name: '', qty: 1, price: 0, unit: 'عدد' }); drawItems(); itemsEl.lastElementChild.querySelector('input').focus(); totals(); };
  const addrList = c => c?.addresses?.length ? c.addresses : (c?.address ? [{ label: '', text: c.address }] : []);
  const pickAddr = c => {
    const l = addrList(c);
    if (l.length <= 1) { $('#ca').value = l[0]?.text || ''; return; }
    const d = sheet(`<h3>انتخاب آدرس</h3>${l.map((a, i) => `<div class="card" data-a="${i}"><b>${esc(a.label || 'آدرس ' + toFa(i + 1))}</b><div class="sub">${esc(a.text)}</div></div>`).join('')}`);
    setTimeout(() => { sheet.cur.onclick = e => { const el = e.target.closest('[data-a]'); if (el) { $('#ca').value = l[+el.dataset.a].text; sheet.cur.close(); } else if (e.target === sheet.cur) sheet.cur.close(); }; });
  };
  $('#pa').onclick = () => { const c = custs.find(x => x.id == inv.customerId) || custs.find(x => x.name === $('#cn').value.trim()); if (!c) return toast('ابتدا مشتری را انتخاب کنید'); pickAddr(c); };
  $('#ph').onclick = async () => {
    const b = $('#ph'); b.disabled = true; b.textContent = 'در حال دریافت موقعیت…';
    try {
      const p = await whereAmI();
      $('#ca').value = p.text || `موقعیت GPS: ${p.lat}, ${p.lng}`;
      toast(p.text ? 'آدرس از موقعیت فعلی پر شد؛ بررسی کنید' : 'آدرس متنی پیدا نشد؛ مختصات نوشته شد');
      const c = custs.find(x => x.id == inv.customerId) || custs.find(x => x.name === $('#cn').value.trim());
      if (c && await ask(`این موقعیت به آدرس‌های «${esc(c.name)}» هم اضافه شود؟`)) {
        const l = addrList(c).map(a => ({ ...a })); l.push({ label: 'ثبت با GPS', text: $('#ca').value.trim(), lat: p.lat, lng: p.lng, acc: p.acc });
        Object.assign(c, { addresses: l, address: l[0].text }); await put('customers', c); toast('به مشتری اضافه شد');
      }
    } catch (e) { toast(geoErr(e)); }
    b.disabled = false; b.textContent = '📡 ثبت آدرس از موقعیت فعلی (GPS)';
  };
  $('#pc').onclick = async () => { if (!custs.length) return toast('ابتدا مشتری ثبت کنید'); const d = sheet(`<h3>انتخاب مشتری</h3>${custs.map(c => `<div class="card" data-c="${c.id}"><b>${esc(c.name)}</b><div class="sub">${toFa(esc(c.phone || ''))}</div></div>`).join('')}`); setTimeout(() => { sheet.cur.onclick = e => { const el = e.target.closest('[data-c]'); if (el) { const c = custs.find(x => x.id == el.dataset.c); inv.customerId = c.id; $('#cn').value = c.name; sheet.cur.close(); pickAddr(c); totals(); } else if (e.target === sheet.cur) sheet.cur.close(); }; }); };
  $('#addp').onclick = () => { if (!prods.length) return toast('ابتدا کالا ثبت کنید'); sheet(`<h3>انتخاب کالا</h3>${prods.map(p => `<div class="card" data-p="${p.id}"><div class="row"><b>${esc(p.name)}</b><span>${rial(p.price)}</span></div></div>`).join('')}`); setTimeout(() => { sheet.cur.onclick = e => { const el = e.target.closest('[data-p]'); if (el) { const p = prods.find(x => x.id == el.dataset.p); const last = inv.items[inv.items.length - 1]; if (last && !last.name && !last.price) inv.items.pop(); inv.items.push({ name: p.name, qty: 1, price: p.price, unit: p.unit }); sheet.cur.close(); drawItems(); totals(); } else if (e.target === sheet.cur) sheet.cur.close(); }; }); };
  $('#gal').onclick = () => {
    readTop();
    const real = inv.items.filter(i => i.name.trim() || i.price);
    const demo = real.length ? real : [{ name: 'نمونه کالا', qty: 2, price: 1500000, unit: 'عدد' }, { name: 'خدمات نصب', qty: 1, price: 800000, unit: 'عدد' }, { name: 'هزینه ارسال', qty: 1, price: 250000, unit: 'عدد' }];
    const base = { ...inv, items: demo, date: parseJ($('#date').value) || inv.date, number: num($('#no').value) || inv.number };
    const sws = COLORS.map(([v, n]) => `<button type="button" class="sw${(inv.color || '#0f766e') === v ? ' on' : ''}" data-col="${v}" style="background:${v}" aria-label="${n}"></button>`).join('');
    sheet(`<h3>انتخاب قالب و رنگ</h3><div class="sws">${sws}</div><div class="gal">${tplList.map(([v, n]) => `<div class="tile${(inv.template || 'classic') === v ? ' on' : ''}" data-t="${v}"><div class="pv"><div class="pvi">${sheetHtml({ ...base, template: v }, settings, null)}</div></div><div class="tn">${n}</div></div>`).join('')}</div>`);
    const d = sheet.cur;
    d.querySelectorAll('.pv').forEach(p => { p.style.height = Math.round(p.clientWidth * 1.3) + 'px'; p.firstElementChild.style.transform = `scale(${p.clientWidth / 380})`; });
    d.onclick = e => {
      const sw = e.target.closest('[data-col]'), tl = e.target.closest('[data-t]');
      if (sw) { inv.color = sw.dataset.col; $('#color').value = inv.color; d.querySelectorAll('.sheet').forEach(x => x.style.setProperty('--p', inv.color)); d.querySelectorAll('.sw').forEach(b => b.classList.toggle('on', b === sw)); }
      else if (tl) { $('#tpl').value = tl.dataset.t; inv.template = tl.dataset.t; d.close(); toast('قالب انتخاب شد'); }
      else if (e.target === d) d.close();
    };
  };
  $('#save').onclick = async () => {
    readTop(); const date = parseJ($('#date').value); if (!date) return toast('تاریخ نامعتبر است (مثال ۱۴۰۴/۰۵/۱۲)');
    const items = inv.items.filter(i => i.name.trim() || i.price); if (!items.length) return toast('حداقل یک قلم وارد کنید');
    const number = num($('#no').value); const dup = (await all('invoices')).find(i => inShop(i, settings) && i.number === number && i.id !== inv.id); if (dup) return toast('این شماره قبلاً استفاده شده');
    const rec = { ...inv, items, number, date }; const nid = await put('invoices', rec); toast('ذخیره شد'); location.hash = '#/invoice/' + (inv.id || nid) + '/view';
  };
}

const sheetHtml = (inv, biz, cust, o = {}) => {
  const t = calc(inv), [c, l] = status(inv), docName = inv.kind === 'proforma' ? 'پیش‌فاکتور' : 'فاکتور فروش';
  return `<div class="sheet tpl-${esc(inv.template || 'classic')}${o.cls ? ' ' + o.cls : ''}"${o.id ? ` id="${o.id}"` : ''} style="--p:${esc(inv.color || '#0f766e')}"><div class="stamp ${c}" ${inv.kind === 'proforma' || c === 'unpaid' ? 'hidden' : ''}>${l}</div>${biz.wm && biz.logo ? `<img class="wm" src="${biz.logo}">` : ''}
   <div class="hd"><div>${biz.logo ? `<img src="${biz.logo}">` : ''}<h2>${esc(biz.name || 'فاکتور فروش')}</h2><div>${toFa(esc(biz.phone || ''))}</div><div>${esc(biz.address || '')}</div></div>
   <div class="meta"><b>${docName}</b><br>شماره: ${toFa(inv.number)}<br>تاریخ: ${showDate(inv.date)}</div></div>
   <div class="parties"><b>خریدار:</b> ${esc(inv.customerName || '—')}${cust?.phone ? ' · ' + toFa(esc(cust.phone)) : ''}${(inv.customerAddress ?? cust?.address) ? '<br>' + esc(inv.customerAddress ?? cust.address) : ''}</div>
   <table><thead><tr><th>#</th><th>شرح</th><th>تعداد</th><th>قیمت واحد</th><th>جمع</th></tr></thead><tbody>${inv.items.map((i, k) => `<tr><td>${toFa(k + 1)}</td><td>${esc(i.name)}</td><td>${toFa(i.qty)} ${esc(i.unit || '')}</td><td>${fmt(i.price)}</td><td>${fmt(i.qty * i.price)}</td></tr>`).join('')}</tbody></table>
   <div class="sum"><div><span>جمع کل</span><span>${rial(t.sub)}</span></div>${t.disc || inv.template === 'emerald' ? `<div><span>تخفیف</span><span>${rial(t.disc)}</span></div>` : ''}${t.tax ? `<div><span>مالیات (${toFa(inv.taxRate)}٪)</span><span>${rial(t.tax)}</span></div>` : ''}<div class="gt"><span>مبلغ قابل پرداخت</span><span>${rial(t.total)}</span></div>${t.paid ? `<div><span>پرداخت‌شده</span><span>${rial(t.paid)}</span></div><div><span>مانده</span><span>${rial(t.due)}</span></div>` : ''}</div>
   <div class="words">${words(t.total)} ریال</div>
   ${biz.sig ? `<div class="sign"><div>امضا خریدار</div><div>${biz.sigLogo && biz.logo ? `<img class="sl" src="${biz.logo}"><br>` : ''}${biz.sigImg ? `<img class="si" src="${biz.sigImg}"><br>` : ''}امضا و مهر فروشنده</div></div>` : ''}
   <div class="ft">${inv.note ? 'توضیحات: ' + esc(inv.note) + '<br>' : ''}${esc(biz.footer || '')}</div></div>`;
};

const saveBlob = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000); };
// ساخت PDF: برگه با عرض ثابت A4 (۷۹۴px) در پس‌زمینه رندر می‌شود تا خروجی روی همه‌ی دستگاه‌ها یکسان باشد؛ شکست صفحه قبل از ردیف‌ها انجام می‌شود.
async function makePdf(inv, biz, cust) {
  await loadScript('js/vendor/html2canvas.min.js', () => window.html2canvas);
  await loadScript('js/vendor/jspdf.umd.min.js', () => window.jspdf);
  const W = 794, H = 1123, PT = 30, PB = 22;
  const host = document.createElement('div');
  host.style.cssText = `position:absolute;left:-12000px;top:0;width:${W}px`;
  host.innerHTML = sheetHtml(inv, biz, cust, { cls: 'pdfmode' });
  document.body.append(host);
  try {
    const el = host.firstElementChild;
    await document.fonts?.ready;
    const r0 = el.getBoundingClientRect(), total = Math.ceil(r0.height);
    const marks = [...el.querySelectorAll('tbody tr, .parties, .sum, .words, .sign, .ft')].map(n => Math.round(n.getBoundingClientRect().top - r0.top)).sort((x, y) => x - y);
    const pages = []; let st = 0;
    if (total <= H) pages.push([0, total]);
    else while (st < total) {
      const cap = H - PB - (st ? PT : 0);
      if (st + cap >= total) { pages.push([st, total]); break; }
      const e = marks.filter(m => m > st + 120 && m <= st + cap).pop() || st + cap;
      pages.push([st, e]); st = e;
    }
    const SC = total > 2600 ? 1.5 : 2;
    const canvas = await window.html2canvas(el, { scale: SC, backgroundColor: '#ffffff', useCORS: true, windowWidth: W, scrollX: 0, scrollY: 0 });
    const bgc = getComputedStyle(el).backgroundColor, bg = bgc && !/rgba\(0, 0, 0, 0\)|transparent/.test(bgc) ? bgc : '#ffffff';
    const { jsPDF } = window.jspdf, pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    pages.forEach(([a, b], k) => {
      const pc = document.createElement('canvas'); pc.width = Math.round(W * SC); pc.height = Math.round(H * SC);
      const x = pc.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, pc.width, pc.height);
      x.drawImage(canvas, 0, a * SC, canvas.width, (b - a) * SC, 0, (k ? PT : 0) * SC, pc.width, (b - a) * SC);
      if (k) pdf.addPage();
      pdf.addImage(pc.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297);
    });
    return pdf.output('blob');
  } finally { host.remove(); }
}

async function invoiceView(id) {
  const inv = await get('invoices', +id); if (!inv) return (location.hash = '#/invoices');
  const biz = await shopById(inv.shopId || 's1'); const t = calc(inv); const cust = inv.customerId ? await get('customers', inv.customerId) : null;
  const [c, l] = status(inv);
  const docName = inv.kind === 'proforma' ? 'پیش‌فاکتور' : 'فاکتور فروش';
  chrome({ title: docName + ' ' + toFa(inv.number), back: '#/invoices' });
  view.innerHTML = sheetHtml(inv, biz, cust, { id: 'sheet' }) + `
   <div class="noprint"><div class="card" style="margin-top:10px"><div class="row"><span>وضعیت پرداخت</span><span class="badge ${c}">${l}</span></div></div>
   <div class="btns"><button class="btn" id="pdf">⬇️ دانلود PDF</button><button class="btn sec" id="prt">🖨 چاپ</button><button class="btn sec" id="share">📤 اشتراک‌گذاری</button><a class="btn sec" href="#/invoice/${inv.id}">✏️ ویرایش</a><button class="btn red" id="del">🗑 حذف</button></div>
   ${t.due > 0 ? '<br><button class="btn sec" id="pay">✅ ثبت تسویه کامل</button>' : ''}</div>`;
  $('#prt').onclick = () => { document.title = 'فاکتور-' + inv.number; window.print(); };
  let pdfBlob = null;
  const pdfName = `فاکتور-${inv.number}.pdf`;
  const getPdf = async () => pdfBlob || (pdfBlob = await makePdf(inv, biz, cust));
  $('#pdf').onclick = async () => {
    const btn = $('#pdf'); btn.disabled = true; btn.textContent = 'در حال ساختن PDF…';
    try { saveBlob(await getPdf(), pdfName); } catch (e) { console.error(e); toast('ساخت PDF ناموفق بود؛ از گزینه چاپ استفاده کنید'); }
    finally { btn.disabled = false; btn.textContent = '⬇️ دانلود PDF'; }
  };
  $('#share').onclick = async () => {
    const btn = $('#share'), label = '📤 اشتراک‌گذاری';
    const txt = `${docName} شماره ${toFa(inv.number)} - ${biz.name || ''}\nمشتری: ${inv.customerName}\nتاریخ: ${showDate(inv.date)}\n${inv.items.map(i => `• ${i.name} × ${toFa(i.qty)} ${i.unit || ''} = ${fmt(i.qty * i.price)}`).join('\n')}\nمبلغ کل: ${rial(t.total)}\n(${words(t.total)} ریال)${t.due > 0 ? '\nمانده: ' + rial(t.due) : ''}`;
    let file = null;
    if (navigator.canShare) {
      btn.disabled = true; if (!pdfBlob) btn.textContent = 'در حال آماده‌سازی PDF…';
      try { file = new File([await getPdf()], pdfName, { type: 'application/pdf' }); } catch (e) { console.error(e); }
      btn.disabled = false; btn.textContent = label;
    }
    try {
      if (file && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: `${docName} ${toFa(inv.number)}` }); return; }
      if (navigator.share) { await navigator.share({ text: txt }); return; }
      await navigator.clipboard?.writeText(txt); toast('متن فاکتور کپی شد');
    } catch (e) {
      if (e?.name === 'AbortError') return;
      if (e?.name === 'NotAllowedError' && file) { btn.textContent = '📤 ارسال PDF (آماده)'; toast('PDF آماده شد؛ یک بار دیگر دکمه را بزنید'); return; }
      toast('اشتراک‌گذاری ممکن نشد');
    }
  };
  $('#del').onclick = async () => { if (await ask('این فاکتور حذف شود؟')) { await del('invoices', inv.id); location.hash = '#/invoices'; } };
  if ($('#pay')) $('#pay').onclick = async () => { inv.paid = t.total; await put('invoices', inv); invoiceView(id); toast('تسویه شد'); };
}

/* ---------- گزارش ---------- */
async function reports() {
  chrome({ title: 'گزارش فروش' });
  const sh = await activeShop(); const inv = (await all('invoices')).filter(i => inShop(i, sh)); const tot = inv.reduce((s, i) => s + calc(i).total, 0), due = inv.reduce((s, i) => s + Math.max(0, calc(i).due), 0);
  const by = {}; inv.forEach(i => { const k = jMonthKey(i.date); by[k] = (by[k] || 0) + calc(i).total; });
  const keys = Object.keys(by).sort((a, b) => b - a).slice(0, 6); const max = Math.max(...keys.map(k => by[k]), 1);
  const cu = {}; inv.forEach(i => { const n = i.customerName || 'بدون نام'; cu[n] = (cu[n] || 0) + calc(i).total; });
  const top = Object.entries(cu).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const nowK = jMonthKey(isoToday());
  const allK = [...new Set(inv.map(i => jMonthKey(i.date)))].sort((x, y) => y - x);
  const selK = allK.includes(nowK) ? nowK : allK[0];
  const mBox = `<div class="card"><h3>گزارش یک ماه</h3>${allK.length ? `<select id="mk">${allK.map(k => `<option value="${k}"${k === selK ? ' selected' : ''}>${MONTHS[k % 100 - 1]} ${toFa(~~(k / 100))}</option>`).join('')}</select><div id="md" style="margin-top:10px"></div>` : empty('📊', 'داده‌ای نیست')}</div>`;
  const drawM = k => {
    const list = inv.filter(i => jMonthKey(i.date) === k).sort((x, y) => x.number - y.number);
    const t = list.reduce((o, i) => { const c = calc(i); o.sub += c.sub; o.disc += c.disc; o.tax += c.tax; o.total += c.total; o.paid += Math.min(c.paid, c.total); o.due += Math.max(0, c.due); return o; }, { sub: 0, disc: 0, tax: 0, total: 0, paid: 0, due: 0 });
    $('#md').innerHTML = `<div class="sub" style="margin-bottom:6px">${toFa(list.length)} فاکتور</div>
      <div class="row" style="padding:3px 0"><span>جمع اقلام</span><b>${rial(t.sub)}</b></div>
      <div class="row" style="padding:3px 0"><span>تخفیف</span><b>${rial(t.disc)}</b></div>
      <div class="row" style="padding:3px 0"><span>مالیات</span><b>${rial(t.tax)}</b></div>
      <div class="row" style="padding:3px 0"><span>جمع کل</span><b>${rial(t.total)}</b></div>
      <div class="row" style="padding:3px 0"><span>دریافتی</span><b style="color:var(--ok)">${rial(t.paid)}</b></div>
      <div class="row" style="padding:3px 0"><span>مانده</span><b style="color:var(--red)">${rial(t.due)}</b></div>
      <div class="btns"><button class="btn sec" id="ms">📤 اشتراک متن گزارش</button></div>
      <div style="margin-top:8px">${list.map(i => `<a class="row" href="#/invoice/${i.id}" style="padding:6px 0;border-bottom:1px solid var(--line);color:inherit;text-decoration:none"><span>${toFa(i.number)} · ${esc(i.customerName || 'بدون نام')}</span><b>${rial(calc(i).total)}</b></a>`).join('') || '<div class="sub">فاکتوری در این ماه نیست</div>'}</div>`;
    $('#ms').onclick = async () => {
      const txt = `گزارش ${MONTHS[k % 100 - 1]} ${toFa(~~(k / 100))}\nتعداد: ${toFa(list.length)} فاکتور\nجمع کل: ${rial(t.total)}\nدریافتی: ${rial(t.paid)}\nمانده: ${rial(t.due)}`;
      if (navigator.share) navigator.share({ text: txt }).catch(() => { }); else { await navigator.clipboard?.writeText(txt); toast('کپی شد'); }
    };
  };
  view.innerHTML = `<div class="stats"><div class="stat hl"><small>کل فروش</small><div>${rial(tot)}</div></div><div class="stat"><small>مطالبات معوق</small><div style="color:var(--red)">${rial(due)}</div></div><div class="stat"><small>تعداد فاکتور</small><div>${toFa(inv.length)}</div></div><div class="stat"><small>فروش این ماه</small><div>${rial(by[nowK] || 0)}</div></div></div>
  <div class="card"><h3>فروش ماهانه</h3>${keys.length ? keys.map(k => `<div style="margin-bottom:10px"><div class="row sub"><span>${MONTHS[k % 100 - 1]} ${toFa(~~(k / 100))}</span><b style="color:var(--tx)">${rial(by[k])}</b></div><div class="bar" style="width:${Math.max(3, by[k] / max * 100)}%"></div></div>`).join('') : empty('📊', 'داده‌ای نیست')}</div>
  <div class="card"><h3>مشتریان برتر</h3>${top.length ? top.map(([n, v], i) => `<div class="row" style="padding:5px 0"><span>${toFa(i + 1)}. ${esc(n)}</span><b>${rial(v)}</b></div>`).join('') : '<div class="sub">—</div>'}</div>
  ${mBox}`;
  if (allK.length) { drawM(selK); $('#mk').onchange = e => drawM(+e.target.value); }
}

/* ---------- تنظیمات و فروشگاه‌ها ---------- */
async function tplSettingsHtml() {
  const h = await tplHidden();
  return TPLS.map(([v, n]) => `<div class="row" style="padding:8px 0;border-bottom:1px solid #e3ebe9"><span style="flex:1">${n}${h.includes(v) ? ' <small style="color:#b91c1c">(حذف‌شده)</small>' : ''}</span>${h.includes(v) ? `<button class="btn sec" data-trest="${v}" style="width:auto;padding:6px 12px;margin:0">بازگردانی</button>` : `<button class="btn sec" data-tdel="${v}" style="width:auto;padding:6px 12px;margin:0;color:#b91c1c">حذف</button>`}</div>`).join('');
}

async function settings() {
  chrome({ title: 'تنظیمات' });
  const l = await shops(), act = await activeShop();
  view.innerHTML = `<div class="card"><h3>فروشگاه‌ها</h3>
  ${l.map(s => `<div class="row" style="padding:8px 0;border-bottom:1px solid #e3ebe9"><label style="display:flex;gap:8px;align-items:center;margin:0;flex:1"><input type="radio" name="act" value="${s.id}" ${s.id === act.id ? 'checked' : ''} style="width:auto;margin:0"><span>${s.logo ? `<img src="${s.logo}" style="height:28px;vertical-align:middle">` : ''} ${esc(s.name)}</span></label><a href="#/shop/${s.id}" class="btn sec" style="width:auto;padding:6px 12px;margin:0">ویرایش</a></div>`).join('')}
  <a class="btn" href="#/shop/new" style="margin-top:12px">+ افزودن فروشگاه</a></div>
  <div class="card" style="margin-top:14px"><h3>قالب‌های فاکتور</h3><div class="sub" style="margin-bottom:8px">قالب‌هایی که حذف کنید از لیست انتخاب فاکتور پنهان می‌شوند.</div>${await tplSettingsHtml()}</div>
  <div class="card" style="margin-top:14px"><h3>پشتیبان‌گیری</h3><div class="sub" style="margin-bottom:10px">همه‌ی اطلاعات (همه‌ی فروشگاه‌ها) فقط روی همین گوشی ذخیره می‌شود. مرتب پشتیبان بگیرید.</div>${await backupWarn()}<div class="btns"><button class="btn sec" id="exp">⬇️ دریافت پشتیبان</button><button class="btn sec" id="imp">⬆️ بازیابی</button></div><input type="file" id="f" accept=".json" hidden></div>`;
  document.querySelectorAll('[data-tdel]').forEach(b => b.onclick = async () => { if (!await ask('این قالب از لیست حذف شود؟')) return; const h = await tplHidden(); await setSetting('hiddenTpls', [...h, b.dataset.tdel]); toast('قالب حذف شد'); settings(); });
  document.querySelectorAll('[data-trest]').forEach(b => b.onclick = async () => { await setSetting('hiddenTpls', (await tplHidden()).filter(x => x !== b.dataset.trest)); toast('قالب بازگردانی شد'); settings(); });
  document.querySelectorAll('input[name=act]').forEach(r => r.onchange = async () => { await setSetting('activeShop', r.value); toast('فروشگاه فعال تغییر کرد'); });
  $('#exp').onclick = async () => { await setSetting('lastBackup', Date.now()); const blob = new Blob([JSON.stringify(await exportAll())], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `factor-backup-${isoToday()}.json`; a.click(); };
  $('#imp').onclick = () => $('#f').click();
  $('#f').onchange = async e => { try { const o = JSON.parse(await e.target.files[0].text()); if (await ask('اطلاعات فعلی با پشتیبان جایگزین شود؟')) { await importAll(o); toast('بازیابی شد'); settings(); } } catch { toast('فایل نامعتبر است'); } };
}

async function backupWarn() {
  const t = await getSetting('lastBackup', 0), days = t ? Math.floor((Date.now() - t) / 864e5) : null;
  if (days === null) return '<div class="sub" style="color:var(--red);margin-bottom:10px">هنوز هیچ پشتیبانی گرفته نشده.</div>';
  return days >= 7 ? `<div class="sub" style="color:var(--red);margin-bottom:10px">آخرین پشتیبان ${toFa(days)} روز پیش بوده است.</div>` : `<div class="sub" style="margin-bottom:10px">آخرین پشتیبان: ${toFa(days)} روز پیش</div>`;
}

async function shopForm(id) {
  const l = await shops(), s = id === 'new' ? {} : (l.find(x => x.id === id) || {});
  let logo = s.logo || '', sigImg = s.sigImg || '';
  chrome({ title: s.id ? 'ویرایش فروشگاه' : 'فروشگاه جدید', back: '#/settings' });
  view.innerHTML = `<div class="card"><label>نام فروشگاه / شرکت *<input id="name" value="${esc(s.name || '')}"></label><label>تلفن<input id="phone" value="${esc(s.phone || '')}"></label><label>آدرس<textarea id="addr" rows="2">${esc(s.address || '')}</textarea></label>
  <div class="g2"><label>مالیات پیش‌فرض (٪)<input id="tax" inputmode="numeric" value="${toFa(s.defTax || 0)}"></label><label>شروع شماره فاکتور<input id="start" inputmode="numeric" value="${toFa(s.startNo || 1)}"></label></div>
  <label>متن پایین فاکتور<input id="footer" value="${esc(s.footer || '')}" placeholder="مثلاً شماره کارت، قوانین…"></label>
  <label>لوگو<input type="file" id="logo" accept="image/*"></label><div id="lp">${logo ? `<img src="${logo}" style="max-height:60px">` : ''}</div>
  <label>تصویر امضا فروشنده (عکس یا اسکن امضا، خودکار سیاه‌وسفید می‌شود)<input type="file" id="sigf" accept="image/*"></label><div id="sp">${sigImg ? `<img src="${sigImg}" style="max-height:60px;background:#fff">` : ''}</div>
  <div class="card" style="margin:8px 0 0"><b>گزینه‌های ظاهر فاکتور</b>
  <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="wm" ${s.wm ? 'checked' : ''} style="width:auto"> واترمارک آرم سیاه‌وسفید وسط فاکتور</label>
  <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="sig" ${s.sig ? 'checked' : ''} style="width:auto"> کادر امضا خریدار و فروشنده پایین فاکتور</label>
  <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="sigLogo" ${s.sigLogo ? 'checked' : ''} style="width:auto"> آرم سیاه‌وسفید در کادر امضا فروشنده</label></div></div>
  <button class="btn" id="s">ذخیره</button>${s.id && l.length > 1 ? '<br><button class="btn red" id="d">حذف فروشگاه</button>' : ''}`;
  $('#logo').onchange = e => { const f = e.target.files[0]; if (f) readLogo(f, u => { logo = u; $('#lp').innerHTML = `<img src="${u}" style="max-height:60px">`; }); };
  $('#sigf').onchange = e => { const f = e.target.files[0]; if (f) toBW(f, u => { sigImg = u; $('#sp').innerHTML = `<img src="${u}" style="max-height:60px;background:#fff">`; }); };
  $('#s').onclick = async () => {
    const name = $('#name').value.trim(); if (!name) return toast('نام فروشگاه را وارد کنید');
    const rec = { ...s, id: s.id || 's' + Date.now().toString(36), name, phone: $('#phone').value.trim(), address: $('#addr').value.trim(), defTax: num($('#tax').value), startNo: num($('#start').value) || 1, footer: $('#footer').value.trim(), logo, sigImg, wm: $('#wm').checked, sig: $('#sig').checked, sigLogo: $('#sigLogo').checked };
    const nl = s.id ? l.map(x => x.id === rec.id ? rec : x) : [...l, rec];
    await setSetting('shops', nl); if (!s.id) await setSetting('activeShop', rec.id);
    toast('ذخیره شد'); location.hash = '#/settings';
  };
  if (s.id && l.length > 1) $('#d').onclick = async () => {
    if (!await ask('این فروشگاه و همه‌ی فاکتورهایش حذف شود؟')) return;
    await setSetting('shops', l.filter(x => x.id !== s.id));
    if ((await getSetting('activeShop')) === s.id) await setSetting('activeShop', l.find(x => x.id !== s.id).id);
    for (const i of (await all('invoices')).filter(i => (i.shopId || 's1') === s.id)) await del('invoices', i.id);
    location.hash = '#/settings';
  };
}

/* ---------- مسیریابی ---------- */
const routes = [
  [/^#\/customers$/, customers], [/^#\/customer\/(\w+)\/report$/, customerReport], [/^#\/customer\/(\w+)$/, customerForm], [/^#\/products$/, products], [/^#\/product\/(\w+)$/, productForm],
  [/^#\/invoices$/, invoices], [/^#\/invoice\/(\d+)\/view$/, invoiceView], [/^#\/invoice\/(\w+)$/, invoiceForm], [/^#\/reports$/, reports], [/^#\/settings$/, settings], [/^#\/shop\/(\w+)$/, shopForm]];
async function doRoute() {
  const h = location.hash || '#/invoices';
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', h.startsWith(a.getAttribute('href').replace(/s$/, ''))));
  for (const [re, fn] of routes) { const m = h.match(re); if (m) { await fn(m[1]); window.scrollTo(0, 0); return; } }
  location.hash = '#/invoices';
}
let chain = Promise.resolve();
const route = () => (chain = chain.then(doRoute).catch(err => { console.error(err); view.innerHTML = empty('⚠️', 'خطا در نمایش صفحه<br><a href="#/invoices">بازگشت به فاکتورها</a>'); }));
addEventListener('hashchange', route); route();
navigator.storage?.persist?.();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
