"use strict";

const STORAGE_KEY = "lab1-results";
const X_MIN = -3;
const X_MAX = 5;
const Y_VALUES = ["-5", "-4", "-3", "-2", "-1", "0", "1", "2", "3"];
const R_VALUES = ["1", "2", "3", "4", "5"];

const form = document.getElementById("point-form");
const xInput = document.getElementById("x");
const errorCell = document.getElementById("error");
const tbody = document.getElementById("results-body");
const clearBtn = document.getElementById("clear-btn");
const canvas = document.getElementById("graph");
const ctx = canvas.getContext("2d");

/* ===================== Проверка попадания ===================== */

/*
 * Область (вариант 22706):
 *  - II четверть: треугольник (-R;0), (0;0), (0;R/2)  →  y <= x/2 + R/2
 *  - I четверть: четверть круга радиуса R/2          →  x² + y² <= (R/2)²
 *  - III четверть: прямоугольник [-R;0] × [-R;0]
 *  - IV четверть: пусто
 */
function isHit(x, y, r) {
    if (x <= 0 && y >= 0) {
        return y <= x / 2 + r / 2;
    }
    if (x >= 0 && y >= 0) {
        return x * x + y * y <= (r / 2) * (r / 2);
    }
    if (x <= 0 && y <= 0) {
        return x >= -r && y >= -r;
    }
    return false;
}

/* ===================== Валидация ===================== */

function getChecked(name) {
    const el = document.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : null;
}

function validateX(raw) {
    const s = raw.trim().replace(",", ".");
    if (s === "") return { ok: false, msg: "Введите значение X." };
    // только число: необязательный знак, цифры, необязательная дробная часть
    if (!/^[-+]?\d+(\.\d+)?$/.test(s)) {
        return { ok: false, msg: "X должен быть числом (например, 1.5)." };
    }
    const x = Number(s);
    if (!(x > X_MIN && x < X_MAX)) {
        return { ok: false, msg: `X должен быть в интервале (${X_MIN}; ${X_MAX}).` };
    }
    return { ok: true, value: x };
}

function validateForm() {
    const xRes = validateX(xInput.value);
    if (!xRes.ok) return xRes;

    const y = getChecked("y");
    if (y === null || !Y_VALUES.includes(y)) {
        return { ok: false, msg: "Выберите значение Y." };
    }

    const r = getChecked("r");
    if (r === null || !R_VALUES.includes(r)) {
        return { ok: false, msg: "Выберите значение R." };
    }
    if (Number(r) <= 0) {
        return { ok: false, msg: "Радиус должен быть положительным." };
    }

    return { ok: true, x: xRes.value, y: Number(y), r: Number(r) };
}

// Блокируем ввод недопустимых символов прямо в поле X
xInput.addEventListener("input", () => {
    const cleaned = xInput.value.replace(/[^0-9.,+-]/g, "");
    if (cleaned !== xInput.value) xInput.value = cleaned;
    const res = validateX(xInput.value);
    xInput.classList.toggle("invalid", xInput.value !== "" && !res.ok);
    errorCell.textContent = xInput.value !== "" && !res.ok ? res.msg : "";
});

/* ===================== LocalStorage ===================== */

function loadResults() {
    try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
        return Array.isArray(data) ? data : [];
    } catch (e) {
        return [];
    }
}

function saveResults(results) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(results));
    } catch (e) {
        console.error("Не удалось сохранить результаты:", e);
    }
}

let results = loadResults();

/* ===================== Дата и время ===================== */

// Храним момент времени в UTC (ISO), выводим в часовом поясе клиента, русская локаль
const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short"
});

function formatDate(iso) {
    return dateFormatter.format(new Date(iso));
}

/* ===================== Таблица ===================== */

function renderTable() {
    tbody.innerHTML = "";
    if (results.length === 0) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 5;
        td.className = "empty";
        td.textContent = "Проверок пока нет";
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
    }
    // новые сверху
    for (let i = results.length - 1; i >= 0; i--) {
        const item = results[i];
        const tr = document.createElement("tr");
        [item.x, item.y, item.r].forEach(v => {
            const td = document.createElement("td");
            td.textContent = v;
            tr.appendChild(td);
        });
        const hitTd = document.createElement("td");
        hitTd.textContent = item.hit ? "Попадание" : "Промах";
        hitTd.className = item.hit ? "hit" : "miss";
        tr.appendChild(hitTd);

        const dateTd = document.createElement("td");
        dateTd.textContent = formatDate(item.time);
        tr.appendChild(dateTd);

        tbody.appendChild(tr);
    }
}

/* ===================== Canvas ===================== */

/*
 * Масштаб холста постоянный (от -6 до 6), а область рисуется с настоящим R.
 * Поэтому при смене R область динамически меняет размер
 * (R = 1 — маленькая, R = 5 — большая), а подписи -R, -R/2, R/2, R
 * сдвигаются вместе с ней.
 */
const SIZE = canvas.width;              // 400
const CENTER = SIZE / 2;                // 200
const MAX = 6;                          // оси от -6 до 6
const UNIT = (CENTER - 16) / MAX;       // сколько пикселей в одной единице

function toCanvasX(v) { return CENTER + v * UNIT; }
function toCanvasY(v) { return CENTER - v * UNIT; }

// Текущий R из формы или null, если R не выбран
function getCurrentR() {
    const r = Number(getChecked("r"));
    return r > 0 ? r : null;
}

function drawArea(selectedR) {
    ctx.clearRect(0, 0, SIZE, SIZE);

    // Если R не выбран, рисуем область-пример (как R = 4) бледным цветом
    const r = selectedR || 4;
    ctx.fillStyle = selectedR ? "rgba(51, 136, 255, 0.85)" : "rgba(51, 136, 255, 0.3)";

    // Прямоугольник (III четверть): от (-R; 0) до (0; -R)
    ctx.fillRect(toCanvasX(-r), toCanvasY(0), r * UNIT, r * UNIT);

    // Треугольник (II четверть): (-R; 0), (0; R/2), (0; 0)
    ctx.beginPath();
    ctx.moveTo(toCanvasX(-r), toCanvasY(0));
    ctx.lineTo(toCanvasX(0), toCanvasY(r / 2));
    ctx.lineTo(toCanvasX(0), toCanvasY(0));
    ctx.closePath();
    ctx.fill();

    // Четверть круга (I четверть), радиус R/2
    ctx.beginPath();
    ctx.moveTo(CENTER, CENTER);
    ctx.arc(CENTER, CENTER, (r / 2) * UNIT, -Math.PI / 2, 0);
    ctx.closePath();
    ctx.fill();

    // Оси
    ctx.strokeStyle = "#000";
    ctx.fillStyle = "#000";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(6, CENTER); ctx.lineTo(SIZE - 6, CENTER);
    ctx.moveTo(CENTER, SIZE - 6); ctx.lineTo(CENTER, 6);
    ctx.stroke();

    // Стрелки
    ctx.beginPath();
    ctx.moveTo(SIZE - 6, CENTER);
    ctx.lineTo(SIZE - 16, CENTER - 5);
    ctx.lineTo(SIZE - 16, CENTER + 5);
    ctx.closePath();
    ctx.moveTo(CENTER, 6);
    ctx.lineTo(CENTER - 5, 16);
    ctx.lineTo(CENTER + 5, 16);
    ctx.closePath();
    ctx.fill();

    ctx.font = "14px Arial";
    ctx.fillText("x", SIZE - 14, CENTER - 10);
    ctx.fillText("y", CENTER + 10, 16);

    // Деления -R, -R/2, R/2, R. Они стоят в точках текущего R,
    // поэтому при смене R подписи сдвигаются вместе с областью.
    const marks = [
        { k: -1,   t: "-R"   },
        { k: -0.5, t: "-R/2" },
        { k: 0.5,  t: "R/2"  },
        { k: 1,    t: "R"    }
    ];
    ctx.font = "12px Arial";
    ctx.lineWidth = 1;
    marks.forEach(m => {
        const px = toCanvasX(m.k * r);
        const py = toCanvasY(m.k * r);

        ctx.beginPath();
        ctx.moveTo(px, CENTER - 4); ctx.lineTo(px, CENTER + 4);
        ctx.moveTo(CENTER - 4, py); ctx.lineTo(CENTER + 4, py);
        ctx.stroke();

        // на оси X: R и -R под осью, R/2 и -R/2 над осью (чтобы не накладывались)
        ctx.textAlign = "center";
        const below = Math.abs(m.k) === 1;
        ctx.fillText(m.t, px, below ? CENTER + 17 : CENTER - 8);
        // на оси Y: подписи справа от оси
        ctx.textAlign = "left";
        ctx.fillText(m.t, CENTER + 7, py + 4);
    });
    ctx.textAlign = "left";

    // Подпись с текущим R
    ctx.font = "bold 14px Arial";
    ctx.fillText(selectedR ? `R = ${selectedR}` : "Выберите R", 10, 20);
}

// Точка рисуется в настоящих координатах (без деления на R)
function drawPoint(x, y, hit) {
    const px = toCanvasX(x);
    const py = toCanvasY(y);
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, 2 * Math.PI);
    ctx.fillStyle = hit ? "#188038" : "#c5221f";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.stroke();
}

function redraw() {
    const r = getCurrentR();
    drawArea(r);
    if (!r) return;
    // показываем точки, проверенные при текущем R
    results.filter(p => p.r === r).forEach(p => drawPoint(p.x, p.y, p.hit));
}

document.querySelectorAll('input[name="r"]').forEach(el =>
    el.addEventListener("change", redraw)
);

/* ===================== Отправка формы ===================== */

form.addEventListener("submit", (e) => {
    e.preventDefault();
    const res = validateForm();
    if (!res.ok) {
        errorCell.textContent = res.msg;
        xInput.classList.toggle("invalid", !validateX(xInput.value).ok);
        return;
    }
    errorCell.textContent = "";
    xInput.classList.remove("invalid");

    const entry = {
        x: res.x,
        y: res.y,
        r: res.r,
        hit: isHit(res.x, res.y, res.r),
        time: new Date().toISOString()
    };
    results.push(entry);
    saveResults(results);
    renderTable();
    redraw();
});

clearBtn.addEventListener("click", () => {
    results = [];
    saveResults(results);
    renderTable();
    redraw();
});

/* ===================== Старт ===================== */

renderTable();
redraw();