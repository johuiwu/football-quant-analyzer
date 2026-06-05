const fs = require("fs");
const cc = fs.readFileSync("D:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/components/corner/CrawlerControlPanel.tsx", "utf8");

// Find main_markets in the activeTab type
const typeIdx = cc.indexOf("main_markets");
console.log("First main_markets at " + typeIdx + ": " + cc.substring(typeIdx, typeIdx + 30));

// Find all main_markets occurrences
let idx = -1;
let count = 0;
while ((idx = cc.indexOf("main_markets", idx + 1)) !== -1) {
  count++;
  console.log("  #" + count + " at " + idx + ": " + cc.substring(idx, Math.min(idx + 60, cc.length)).replace(/\r\n/g, " "));
}

// Find the render section for main_markets
const renderSearch = 'activeTab === "main_markets"';
const renderIdx = cc.indexOf(renderSearch);
if (renderIdx > 0) {
  console.log("\n=== Render section starts at " + renderIdx + " ===");
  console.log(cc.substring(renderIdx, renderIdx + 200));
} else {
  console.log("\nRender section NOT FOUND!");
}

// Check recvMainMarkets context
const recvIdx = cc.indexOf("recvMainMarkets");
console.log("\n=== recvMainMarkets context ===");
console.log(cc.substring(Math.max(0, recvIdx - 150), recvIdx + 300));
