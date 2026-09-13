import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
const BASE="https://km.mega-cash.net";
const OUT="artifacts/mega-general-journal";
const COMPANY="KM-01_01_2022", USER="test", PASS="112233445566";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
fs.mkdirSync(path.join(OUT,"pdf"),{recursive:true});
const browser=await puppeteer.launch({headless:true,args:["--no-sandbox","--disable-setuid-sandbox"]});
const page=await browser.newPage();
page.setDefaultTimeout(90000);
await page.goto(BASE+"/",{waitUntil:"domcontentloaded"});
await sleep(1500);
await page.waitForSelector("input[type=password]");
await page.evaluate((c,u,p)=>{
  const texts=[...document.querySelectorAll("input[type=text]")];
  if(texts[0]){texts[0].value=c;texts[0].dispatchEvent(new Event("input",{bubbles:true}));}
  const userEl=texts.at(-1); const passEl=document.querySelector("input[type=password]");
  if(userEl){userEl.value=u;userEl.dispatchEvent(new Event("input",{bubbles:true}));}
  if(passEl){passEl.value=p;passEl.dispatchEvent(new Event("input",{bubbles:true}));}
  document.querySelector("input[type=submit]")?.click();
},COMPANY,USER,PASS);
await Promise.race([page.waitForNavigation({waitUntil:"networkidle2"}).catch(()=>null),sleep(8000)]);
await sleep(2000);
for (const url of ["/Accounting/GeneralJournalList.aspx","/FinalReports/GeneralJournal.aspx","/AccountingReports/GeneralJournal.aspx"]) {
  console.log("TRY", url);
  await page.goto(BASE+url,{waitUntil:"domcontentloaded",timeout:60000}).catch(e=>console.log("nav fail",e.message));
  await sleep(3000);
  const info=await page.evaluate(()=>({
    title: document.title,
    url: location.href,
    h1: document.querySelector("h1,h2,.page-title,#lblTitle")?.innerText||"",
    bodyStart: (document.body?.innerText||"").slice(0,500),
    denied: /الوصول مرفوض|صلاحيات|StartScreen/i.test(document.body?.innerText||""),
    th: [...document.querySelectorAll("table th, .rgHeader, .HeaderStyle th, .GridHeader th")].map(el=>el.innerText.trim()).filter(Boolean).slice(0,30),
    headers: [...document.querySelectorAll("[id*='Header'], .list-header, thead td, thead th")].map(el=>el.innerText.trim()).filter(Boolean).slice(0,40),
  }));
  console.log(JSON.stringify(info,null,2));
  const safe=url.replace(/\W+/g,"_");
  await page.screenshot({path:path.join(OUT,"pdf",`${safe}.png`),fullPage:true}).catch(()=>{});
  fs.writeFileSync(path.join(OUT,`${safe}.json`), JSON.stringify(info,null,2));
}
await browser.close();
