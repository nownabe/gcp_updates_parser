const fs      = require("fs");
const JSDOM   = require("jsdom").JSDOM;
const parser  = require("mailparser").simpleParser;
const fetch   = require("node-fetch");

function getMainTables(doc) {
  const table  = doc.querySelector("table table table:nth-child(2)");
  const tbody  = table.querySelector("tbody");
  const tr     = tbody.querySelector("tr:nth-child(1)");
  const td     = tbody.querySelector("td:nth-child(1)");
  return td.children;
}

function getTitleTable(doc) {
  return getMainTables(doc)[0];
}

function getTitle(doc) {
  const cell = getTitleTable(doc).querySelector("table table table table table td");
  return cell.innerHTML.trim().
    replace(/&nbsp;/g, " ").
    replace(/<[^>]+>/g, "").
    replace(/\s+/g, " ");
}

function getFeaturedTables(doc) {
  const tables = getMainTables(doc);
  const arr = [];
  for (let i = 1; i < tables.length - 4; i++) {
    arr.push(tables.item(i));
  }
  return arr;
}

async function getRedirectedURL(url) {
  const res = await fetch(url);
  return res.url.replace(/\?.+$/, "");
}

async function getFeaturedUpdate(table) {
  const innerTable = table.querySelector("td > div:nth-child(2) table table");
  const trs = innerTable.querySelectorAll("tr");

  const titleCell = trs.item(trs.length - 2).querySelector("td");
  const descriptionCell = trs.item(trs.length - 1).querySelector("td");

  const titleLink = titleCell.querySelector("a");
  const url = await getRedirectedURL(titleLink.getAttribute("href"));

  const update = {
    title: titleLink.textContent,
    description: descriptionCell.textContent.trim(),
    url: url,
  };

  if (trs.length == 3) {
    update["category"] = trs.item(0).querySelector("td").innerHTML.trim().replace(/&amp;/, "&");
  }

  return update;
}

async function getFeaturedUpdates(doc) {
  const updates = [];
  const featuredTables = getFeaturedTables(doc);
  for (let i = 0; i < featuredTables.length; i++) {
    const res = await getFeaturedUpdate(featuredTables[i]);
    updates.push(res);
  }
  return updates;
}

function getAdditionalTable(doc) {
  const tables = getMainTables(doc);
  return tables[tables.length - 4];
}

async function getAdditionalUpdates(doc) {
  const updates = [];
  const updateTables = getAdditionalTable(doc).querySelectorAll("table");

  let category;
  let title;
  let url;

  for (let i = 0; i < updateTables.length; i++) {
    const table = updateTables[i];
    if (table.querySelector("a")) {
      const link = table.querySelector("a");
      title = link.innerHTML.trim();
      url = await getRedirectedURL(link.getAttribute("href"));
    } else {
      if (title) {
        updates.push({
          category: category,
          title: title,
          url: url,
          description: table.querySelector("td").innerHTML.trim(),
        });
        title = null;
      } else {
        category = table.querySelector("td").innerHTML.trim();
      }
    }
  }
  return updates;
}

async function main(err, mail) {
  console.log(mail.subject);
  console.log();

  const dom = new JSDOM(mail.html);
  const doc = dom.window.document;

  const updates = {};

  const featuredUpdates = await getFeaturedUpdates(doc);

  let category = featuredUpdates[0].category;
  featuredUpdates.forEach(u => {
    category = u.category || category;
    if(!updates[category]) updates[category] = [];
    updates[category].push(u);
  });

  const additionalUpdates = await getAdditionalUpdates(doc);
  additionalUpdates.forEach(u => {
    if(!updates[u.category]) updates[u.category] = [];
    updates[u.category].push(u);
  });

  for (let category in updates) {
    console.log(`# ${category}\n`);
    updates[category].forEach(u => {
      console.log(`## [${u.title}](${u.url})\n`)
      console.log(`> ${u.description}\n`)
    });
  }
}

fs.readFile("./mail", "utf8", (err, source) => parser(source, main));
