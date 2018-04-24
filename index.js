const fs      = require("fs");
const JSDOM   = require("jsdom").JSDOM;
const parser  = require("mailparser").simpleParser;
const fetch   = require("node-fetch");

function handleError(err) {
  console.error(err);
}

function getMainTables(doc) {
  const table  = doc.querySelector("table table table:nth-child(2) table");
  const tbody  = table.querySelector("tbody");
  const tr     = tbody.querySelector("tr");
  const td     = tbody.querySelector("td");
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
  for (let i = 1; i < featuredTables.length; i += 2) {
    const res = await getFeaturedUpdate(featuredTables[i]).catch(handleError);
    updates.push(res);
  }
  return updates;
}

function getAdditionalTable(doc) {
  const tables = getMainTables(doc)
  return tables[1];
}

async function getAdditionalUpdates(doc) {
  const updates = [];
  const updateTables = getAdditionalTable(doc).querySelector("table:nth-child(1)").querySelectorAll("table");

  let category;
  let title;
  let url;

  for (let i = 0; i < updateTables.length; i++) {
    const table = updateTables[i];
    if (table.querySelector("a")) {
      // body

      const nodes = table.querySelector("td").childNodes
      let content = "";
      for (j = 0; j < nodes.length; j++) {
        const type = nodes[j].constructor.name;
        if (type === "Text") {
          content += nodes[j].textContent;
        } else if (type === "HTMLAnchorElement") {
          if (nodes[j].textContent === "View here") continue;
          const url = await getRedirectedURL(nodes[j].getAttribute("href"));
          content += `[${nodes[j].textContent}](${url})`;
        } else if (type === "Comment"){
          continue
        } else {
          console.log(nodes[j]);
          console.log(nodes[j].innerHTML);
          throw "Unknown Element Type";
        }
      }

      const link = table.querySelector("a");
      url = await getRedirectedURL(link.getAttribute("href"));

      updates.push({
        category: category,
        title: title,
        url: url,
        description: content,
      });
    } else {
      const content = table.querySelector("td").innerHTML.trim();
      if (content.indexOf(".") >= 0) {
        // title
        title = content;
      } else {
        // category
        category = content;
      }
    }
  }
  return updates;
}

async function main(err, mail) {
  try {
    console.log(mail.subject);
    console.log();

    const dom = new JSDOM(mail.html);
    const doc = dom.window.document;

    const updates = {};

    const featuredUpdates = await getFeaturedUpdates(doc);

    if (featuredUpdates.length > 0) {
      let category = featuredUpdates[0].category;
      featuredUpdates.forEach(u => {
        category = u.category || category;
        if(!updates[category]) updates[category] = [];
        updates[category].push(u);
      });
    }

    const additionalUpdates = await getAdditionalUpdates(doc).catch(handleError);
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
  } catch (err) {
    handleError(err)
  }
}

fs.readFile("./mail", "utf8", (err, source) => parser(source, main));
