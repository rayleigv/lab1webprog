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

const SIZE = canvas.width;
const CENTER = SIZE / 2;
const UNIT = SIZE * 0.4; // пикселей на R (график в условных единицах R)

function toCanvasX(v) { return CENTER + v * UNIT; }
function toCanvasY(v) { return CENTER - v * UNIT; }

function drawArea() {
    ctx.clearRect(0, 0, SIZE, SIZE);

    // Область (в долях R: R = 1)
    ctx.fillStyle = "rgba(51, 136, 255, 0.85)";

    // Прямоугольник (III четверть)
    ctx.fillRect(toCanvasX(-1), toCanvasY(0), UNIT, UNIT);

    // Треугольник (II четверть)
    ctx.beginPath();
    ctx.moveTo(toCanvasX(-1), toCanvasY(0));
    ctx.lineTo(toCanvasX(0), toCanvasY(0.5));
    ctx.lineTo(toCanvasX(0), toCanvasY(0));
    ctx.closePath();
    ctx.fill();

    // Четверть круга (I четверть)
    ctx.beginPath();
    ctx.moveTo(CENTER, CENTER);
    ctx.arc(CENTER, CENTER, UNIT / 2, -Math.PI / 2, 0);
    ctx.closePath();
    ctx.fill();

    // Оси
    ctx.strokeStyle = "#000";
    ctx.fillStyle = "#000";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(10, CENTER); ctx.lineTo(SIZE - 10, CENTER);
    ctx.moveTo(CENTER, SIZE - 10); ctx.lineTo(CENTER, 10);
    ctx.stroke();

    // Стрелки
    ctx.beginPath();
    ctx.moveTo(SIZE - 10, CENTER);
    ctx.lineTo(SIZE - 20, CENTER - 5);
    ctx.lineTo(SIZE - 20, CENTER + 5);
    ctx.closePath();
    ctx.moveTo(CENTER, 10);
    ctx.lineTo(CENTER - 5, 20);
    ctx.lineTo(CENTER + 5, 20);
    ctx.closePath();
    ctx.fill();

    ctx.font = "14px Arial";
    ctx.fillText("x", SIZE - 18, CENTER - 10);
    ctx.fillText("y", CENTER + 8, 18);

    // Деления и подписи
    const marks = [
        { v: -1, t: "-R" }, { v: -0.5, t: "-R/2" },
        { v: 0.5, t: "R/2" }, { v: 1, t: "R" }
    ];
    ctx.font = "13px Arial";
    marks.forEach(m => {
        const px = toCanvasX(m.v);
        ctx.beginPath();
        ctx.moveTo(px, CENTER - 4); ctx.lineTo(px, CENTER + 4);
        ctx.stroke();
        ctx.fillText(m.t, px - 10, CENTER - 8);

        const py = toCanvasY(m.v);
        ctx.beginPath();
        ctx.moveTo(CENTER - 4, py); ctx.lineTo(CENTER + 4, py);
        ctx.stroke();
        ctx.fillText(m.t, CENTER + 8, py + 4);
    });
}

// Точка рисуется относительно текущего R (график нарисован в долях R)
function drawPoint(x, y, r, hit) {
    const px = toCanvasX(x / r);
    const py = toCanvasY(y / r);
    if (px < 0 || px > SIZE || py < 0 || py > SIZE) return; // за пределами холста
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, 2 * Math.PI);
    ctx.fillStyle = hit ? "#188038" : "#c5221f";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.stroke();
}

function redraw() {
    drawArea();
    const r = Number(getChecked("r"));
    if (!r) return;
    // показываем точки, проверенные при текущем R
    results.filter(p => p.r === r).forEach(p => drawPoint(p.x, p.y, p.r, p.hit));
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
drawArea();
