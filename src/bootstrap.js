/* global Zotero, Services, Components, Cc, Ci */
var chromeHandle;
var sectionID = false;

const PREF_WORDS = "extensions.zolight.patterns";
const PREF_COLORS = "extensions.zolight.colors";
const FTL = "zolight.ftl";
const SECTION_ICON = "chrome://zolight/content/icons/section.svg";

const PALETTE = [
	"#f5c542", "#e8745a", "#5ac8a0", "#78a0e6",
	"#c878dc", "#50c8e6", "#f08c64", "#a0dc50",
	"#e65078", "#50b450", "#b46440", "#64a0c8",
];

// ---------- words, colors, matching ----------

// One word/pattern per line or comma-separated; "#" starts an ignored line.
function parseWords(text) {
	const seen = new Set();
	const out = [];
	for (const raw of text.split(/[\n,]+/)) {
		const w = raw.trim().replace(/\s+/g, " ");
		if (!w || w.startsWith("#")) continue;
		const k = w.toLowerCase();
		if (seen.has(k)) continue;
		seen.add(k);
		out.push(w);
	}
	return out;
}

// *  = any run of letters/digits/'/- (including nothing)
// ?  = exactly one letter/digit
// space = any whitespace run (so phrases work)
const W = "\\p{L}\\p{N}_";
function patternSource(p) {
	let out = "";
	for (const ch of p) {
		if (ch === "*") out += `[${W}'’-]*`;
		else if (ch === "?") out += "[\\p{L}\\p{N}]";
		else if (ch === " ") out += "\\s+";
		else out += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	}
	return out;
}

// Returns { re, order } where capture group i+1 of re belongs to order[i].
function compileWords(words) {
	if (!words.length) return null;
	const entries = words
		.map(w => ({ w, src: patternSource(w) }))
		.sort((a, b) => b.w.length - a.w.length);
	try {
		const re = new RegExp(
			`(?<![${W}])(?:${entries.map(e => `(${e.src})`).join("|")})(?![${W}])`,
			"giu"
		);
		return { re, order: entries.map(e => e.w) };
	}
	catch (e) {
		Zotero.logError(e);
		return null;
	}
}

function textColorFor(hex) {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return (0.299 * r + 0.587 * g + 0.114 * b) > 128 ? "#111111" : "#ffffff";
}

function loadColors() {
	try {
		const c = JSON.parse(Zotero.Prefs.get(PREF_COLORS, true) || "{}");
		return c && typeof c === "object" ? c : {};
	}
	catch (e) {
		return {};
	}
}

function saveColors(colors) {
	Zotero.Prefs.set(PREF_COLORS, JSON.stringify(colors), true);
}

// ---------- UI ----------

function render(body, item, setSummary) {
	const doc = body.ownerDocument;
	const win = doc.defaultView;
	const h = (tag, css = "") => {
		const e = doc.createElementNS("http://www.w3.org/1999/xhtml", tag);
		if (css) e.style.cssText = css;
		return e;
	};

	body.replaceChildren();
	const wrap = h("div", "display:flex; flex-direction:column; gap:8px; padding:4px 0; width:100%;");

	const preview = h("div", "white-space:pre-wrap; line-height:1.6; -moz-user-select:text; user-select:text; cursor:text;");
	const stats = h("div", "font-size:0.8em; opacity:0.7;");
	const chips = h("div", "display:flex; flex-wrap:wrap; gap:6px; align-items:center;");

	const label = h("div", "font-size:0.85em; opacity:0.7;");
	label.textContent = "Words to highlight: one per line or comma-separated. * = any letters, ? = one letter.";

	const box = h("textarea", "width:100%; box-sizing:border-box; min-height:64px; font:inherit; resize:vertical;");
	box.placeholder = "neuro*\n?omics\nmachine learning";
	box.value = Zotero.Prefs.get(PREF_WORDS, true) || "";

	let colors = loadColors();
	let words = [];

	const colorOf = w => colors[w.toLowerCase()];

	function renderPreview() {
		const abstract = (item.getField("abstractNote") || "").trim();
		preview.replaceChildren();
		stats.textContent = "";
		if (!abstract) {
			preview.textContent = "This item has no abstract.";
			preview.style.opacity = "0.6";
			setSummary?.("");
			return;
		}
		preview.style.opacity = "";
		const compiled = compileWords(words);
		let last = 0, count = 0;
		if (compiled) {
			for (const m of abstract.matchAll(compiled.re)) {
				if (!m[0]) continue;
				let gi = -1;
				for (let i = 1; i < m.length; i++) {
					if (m[i] !== undefined) { gi = i - 1; break; }
				}
				const bg = (gi >= 0 && colorOf(compiled.order[gi])) || PALETTE[0];
				preview.append(abstract.slice(last, m.index));
				const mark = h("mark", `background:${bg}; color:${textColorFor(bg)}; border-radius:2px; padding:0 2px; font-weight:500;`);
				mark.textContent = m[0];
				preview.append(mark);
				last = m.index + m[0].length;
				count++;
			}
		}
		preview.append(abstract.slice(last));
		if (words.length) {
			stats.textContent = `${count} match${count === 1 ? "" : "es"} for ${words.length} word${words.length === 1 ? "" : "s"}`;
		}
		setSummary?.(count ? `${count} match${count === 1 ? "" : "es"}` : "");
	}

	function removeWord(word) {
		const kept = box.value.split("\n")
			.map(line => line.split(",").map(p => p.trim())
				.filter(p => p && p.replace(/\s+/g, " ").toLowerCase() !== word.toLowerCase())
				.join(", "))
			.filter(line => line.trim());
		box.value = kept.join("\n");
		refresh(true);
	}

	function renderChips() {
		chips.replaceChildren();
		if (!words.length) {
			const hint = h("span", "font-size:0.85em; opacity:0.6; font-style:italic;");
			hint.textContent = "Add words below to see them here…";
			chips.append(hint);
			return;
		}
		for (const w of words) {
			const key = w.toLowerCase();
			const color = colors[key];
			const chip = h("div", `display:flex; align-items:center; gap:6px; padding:2px 4px 2px 4px; border-radius:4px; border:1px solid ${color}66;`);

			const dot = h("label", `position:relative; width:16px; height:16px; border-radius:50%; background:${color}; border:2px solid rgba(128,128,128,0.5); overflow:hidden; cursor:pointer; flex-shrink:0;`);
			dot.title = "Click to change color";
			const picker = h("input", "position:absolute; inset:-4px; width:calc(100% + 8px); height:calc(100% + 8px); opacity:0; cursor:pointer; border:none; padding:0;");
			picker.type = "color";
			picker.value = color;
			const name = h("span", `font-weight:500; color:${color};`);
			name.textContent = w;
			picker.addEventListener("input", () => {
				colors[key] = picker.value;
				saveColors(colors);
				dot.style.background = picker.value;
				chip.style.borderColor = picker.value + "66";
				name.style.color = picker.value;
				renderPreview();
			});
			dot.append(picker);

			const x = h("button", "width:16px; height:16px; border:none; border-radius:50%; background:rgba(128,128,128,0.2); cursor:pointer; padding:0; line-height:1; font-size:11px; color:inherit;");
			x.textContent = "×";
			x.title = `Remove "${w}"`;
			x.addEventListener("click", () => removeWord(w));

			chip.append(dot, name, x);
			chips.append(chip);
		}
	}

	function refresh(save) {
		if (save) Zotero.Prefs.set(PREF_WORDS, box.value, true);
		words = parseWords(box.value);
		// Give each new word a default color from the palette
		let changed = false;
		words.forEach((w, i) => {
			const k = w.toLowerCase();
			if (!colors[k]) {
				colors[k] = PALETTE[i % PALETTE.length];
				changed = true;
			}
		});
		if (changed) saveColors(colors);
		renderChips();
		renderPreview();
	}

	let timer;
	box.addEventListener("input", () => {
		win.clearTimeout(timer);
		timer = win.setTimeout(() => refresh(true), 150);
	});

	wrap.append(preview, stats, chips, label, box);
	body.append(wrap);
	refresh(false);
}

// ---------- lifecycle ----------

function install() {}

async function startup({ id, rootURI }) {
	const aomStartup = Cc["@mozilla.org/addons/addon-manager-startup;1"]
		.getService(Ci.amIAddonManagerStartup);
	chromeHandle = aomStartup.registerChrome(
		Services.io.newURI(rootURI + "manifest.json"),
		[
			["content", "zolight", "content/"],
			["locale", "zolight", "en-US", "locale/en-US/"],
		]
	);

	await Zotero.initializationPromise;
	for (const win of Zotero.getMainWindows()) onMainWindowLoad({ window: win });

	sectionID = Zotero.ItemPaneManager.registerSection({
		paneID: "zolight",
		pluginID: id,
		header: {
			l10nID: "zolight-header",
			icon: SECTION_ICON,
		},
		sidenav: {
			l10nID: "zolight-sidenav",
			icon: SECTION_ICON,
		},
		onItemChange: ({ item, setEnabled }) => {
			// Only ever enable for a single, real regular item. Anything else
			// (no selection, multiple selection, Zotero 10's batch-edit view)
			// must stay disabled and must never throw.
			let enabled = false;
			try {
				enabled = !!item
					&& !Array.isArray(item)
					&& typeof item.isRegularItem === "function"
					&& typeof item.getField === "function"
					&& item.isRegularItem();
			}
			catch (e) {
				Zotero.debug("[Abstract Highlighter] onItemChange error: " + e);
			}
			setEnabled(enabled);
		},
		onRender: ({ body, item, setSectionSummary }) => {
			try {
				if (item && typeof item.getField === "function") {
					render(body, item, setSectionSummary);
				}
			}
			catch (e) {
				Zotero.debug("[Abstract Highlighter] render error: " + e);
				Zotero.logError(e);
			}
		},
	});
}

function onMainWindowLoad({ window }) {
	window.MozXULElement.insertFTLIfNeeded(FTL);
}

function onMainWindowUnload({ window }) {
	window.document.querySelector(`[href="${FTL}"]`)?.remove();
}

function shutdown() {
	if (sectionID) Zotero.ItemPaneManager.unregisterSection(sectionID);
	for (const win of Zotero.getMainWindows()) onMainWindowUnload({ window: win });
	chromeHandle?.destruct();
	chromeHandle = null;
}

function uninstall() {}
