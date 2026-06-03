const fs = require("fs");
const path = "D:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/backend/services/hgCrawlerService.js";
const content = fs.readFileSync(path, "utf8");
const lines = content.split("\n");

let depth = 0;
let inString = false, stringChar = "";
let inTemplate = false;
let inBlockComment = false;
let inLineComment = false;

for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    inLineComment = false;
    for (let ci = 0; ci < line.length; ci++) {
        const ch = line[ci];
        const next = ci + 1 < line.length ? line[ci+1] : "";
        
        if (inLineComment) continue;
        if (inBlockComment) {
            if (ch === "*" && next === "/") { inBlockComment = false; ci++; }
            continue;
        }
        if (ch === "/" && next === "/") { inLineComment = true; continue; }
        if (ch === "/" && next === "*") { inBlockComment = true; ci++; continue; }
        if (inTemplate) {
            if (ch === "`" && ci > 0 && line[ci-1] !== "\\") inTemplate = false;
            continue;
        }
        if (inString) {
            if (ch === "\\") { ci++; continue; }
            if (ch === stringChar) inString = false;
            continue;
        }
        if (ch === "`") { inTemplate = true; continue; }
        if (ch === "\"" || ch === "'") { inString = true; stringChar = ch; continue; }
        if (ch === "{") depth++;
        if (ch === "}") depth--;
    }
    if (li >= 895 && li <= 1020) {
        console.log("L" + (li+1) + " depth=" + depth);
    }
}
console.log("Final depth: " + depth);
