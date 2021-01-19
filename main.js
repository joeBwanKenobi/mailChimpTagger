const mailchimp = require("@mailchimp/mailchimp_marketing")
const fs = require('fs')
require('dotenv').config()
const schedule = require("node-schedule")
const { pathToFileURL } = require("url")
const Tagger = require("./src/tagger/tagger")

// Configure Mailchimp app integration
mailchimp.setConfig({
    apiKey: process.env.API_KEY,
    server: process.env.MC_SERVER,
})
let targetTags = process.env.TAGS.split(':')
let sources = process.env.SOURCES.split(':')
const listId = process.env.LIST_ID

// App constants, new date is generated for reference on next run
const dryRun = process.argv.includes('--dry-run') ? true : false
const realTime = process.argv.includes('--real-time') ? true : false
const count = process.argv.includes('-c') ? process.argv[process.argv.indexOf('-c') + 1] : 10
let lastChanged = (fs.existsSync('./runtimes.json')) ? require('./runtimes.json').lastRun : new Date().now.toISOString()

// Logger
function log(dateTime, data) {
    // Write file with targeted contacts for given run of this script
    let d = new Intl.DateTimeFormat('en', { day: '2-digit'}).format(dateTime)
    let m = new Intl.DateTimeFormat('en', { month: '2-digit'}).format(dateTime)
    let y = new Intl.DateTimeFormat('en', { year: 'numeric'}).format(dateTime)
    let fDate = `${y}-${m}-${d}`
    
    if (!fs.existsSync('./logs/')) {
        fs.mkdirSync('./logs')
    }
    fs.writeFileSync(`./logs/${fDate}-members.json`, JSON.stringify(data))
}

// Check for untagged contacts since last run and update if found
console.log(`Dry run: ${dryRun}`)
if (dryRun) {
    let now = new Date();
    let t = new Tagger(listId, sources, targetTags, lastChanged, count)
    t.updateDryRun()
        .then((data) => {
            // Log targeted members
            log(now, t.members)
        })
} else if (realTime) {
    let now = new Date();
    console.log(lastChanged, now)
    let t = new Tagger(listId, sources, targetTags, lastChanged, count)
    t.update()
        .then((data) => {
            // Log targeted members
            log(now, t.members)
            lastChanged = now.toISOString()
        })
    // Write last runtime to file for next since_last_changed reference
    fs.writeFileSync('runtimes.json', JSON.stringify({lastRun: now.toISOString()}))
} else if (!dryRun) {
    // Run at midnight daily
    schedule.scheduleJob('0 0 * * *', () => {
        let now = new Date();
        console.log(lastChanged, now)
        let t = new Tagger(listId, sources, targetTags, lastChanged, count)
        t.update()
            .then((data) => {
                // Log targeted members
                log(now, t.members)
                lastChanged = now.toISOString()
            })
        // Write last runtime to file for next since_last_changed reference
        fs.writeFileSync('runtimes.json', JSON.stringify({lastRun: now.toISOString()}))
    })
}