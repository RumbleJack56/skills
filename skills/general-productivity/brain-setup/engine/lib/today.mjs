// today.md: the live day file. Sections are level-2 headings.
export const SECTIONS = ["Win", "Plan", "Routines", "Tasks", "Wins"];
export const todayTemplate = (date) => `---\ntype: today\ndate: ${date}\n---\n${SECTIONS.map((s) => `## ${s}\n${s === "Win" ? "> \n" : ""}`).join("")}`;

export function sectionRange(lines, name) {
  const s = lines.findIndex((l) => l === `## ${name}`);
  if (s < 0) return null;
  let e = lines.length;
  for (let i = s + 1; i < lines.length; i++) if (/^## /.test(lines[i])) { e = i; break; }
  return { s, e };
}
// Append lines at the end of a section (before trailing blank lines), creating the section if missing.
export function addToSection(text, name, add) {
  const lines = text.split("\n");
  let r = sectionRange(lines, name);
  if (!r) {
    while (lines.length && lines[lines.length - 1] === "") lines.pop();
    lines.push(`## ${name}`, "");
    r = sectionRange(lines, name);
  }
  let at = r.e;
  while (at > r.s + 1 && lines[at - 1].trim() === "") at--;
  lines.splice(at, 0, ...add);
  let out = lines.join("\n");
  if (!out.endsWith("\n")) out += "\n";
  return out;
}
export function setWin(text, win) {
  const lines = text.split("\n");
  const r = sectionRange(lines, "Win");
  const content = [`> ${win}`];
  if (!r) return addToSection(text, "Win", content);
  lines.splice(r.s + 1, r.e - r.s - 1, ...content);
  return lines.join("\n");
}
export const todayDate = (text) => /^date:\s*(\d{4}-\d{2}-\d{2})\s*$/m.exec(text)?.[1] ?? null;
