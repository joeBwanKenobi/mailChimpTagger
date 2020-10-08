const mailchimp = require("@mailchimp/mailchimp_marketing")
const fs = require('fs')
require('dotenv').config()
const schedule = require("node-schedule")
const { pathToFileURL } = require("url")

// Configure Mailchimp app integration
mailchimp.setConfig({
    apiKey: process.env.API_KEY,
    server: process.env.MC_SERVER,
})
let targetTags = process.env.TAGS.split(':')
let sources = process.env.SOURCES.split(':')
const listId = process.env.LIST_ID

// App constants, new date is generated for reference on next run
const now = new Date();
const count = 100
const dryRun = process.argv.includes('--dry-run') ? true : false
const lastChanged = (fs.existsSync('./runtimes.json')) ? require('./runtimes.json').lastRun : now.toISOString()

async function pull() {
    /* 
        Pull contacts that have changed since the last run of this script.  If the contact was added by API-Generic and are not tagged as an Ultracart customer,
        add them to an array of targeted members.
    */
    let response = await mailchimp.lists.getListMembersInfo(listId, { 
        count: count,
        sinceLastChanged: lastChanged,
        fields: ['members.id', 'members.email_address', 'members.status', 'members.ip_signup', 'members.timestamp_signup', 'members.ip_opt', 'members.timestamp_opt', 'members.member_rating', 'members.last_changed', 'members.vip', 'members.source', 'members.tags_count', 'members.tags'],
        })
    try {
        console.log(`Pulling updated contacts since: ${lastChanged}`)
        let membersArr = []
        response.members.map((member) => {
            // If member was added by generic api / api title for ultracart continue processing
            if (sources.includes(member.source)) {
                // If member doesn't have a tag of name 'Ultracart' or 'Customer' continue processing
                if (!(member.tags.some(tag => targetTags.includes(tag.name)))) {
                    // console.log(`Adding ${member.email_address}`)
                    membersArr.push(member)
                }
            }           
        }) 
        console.log(`Since Last Change: ${response.members.length} -- Targeted for tagging: ${membersArr.length}`)
        write(now, membersArr)
        return membersArr
    } catch (err) {
        console.log(err)
    }
}

async function updateDryRun() {
    let targetMembers = await pull()
    try {
        targetMembers.map((member) => {
            console.log('Would be calling to mailchimp...')
            console.log(`mailchimp.lists.updateListMemberTags(
                ${listId},
                ${member.id},
                {
                    body: {
                        tags: ${JSON.stringify(populateTags(targetTags))},
                    },
                }
            )`)
        })
    } catch (err) {
        console.error(err)
    }
}

async function update() {
    let targetMembers = await pull()
    try {
        return Promise.all(targetMembers.map((contact) => {updateContact(contact)}))
    } catch (err) {
        console.error(err)
    }
}

async function updateContact(contact) {
    try {
        let subscriberHash = contact.id
        var response = await mailchimp.lists.updateListMemberTags(
            listId,
            subscriberHash,
            {
                body: {
                    tags: populateTags(targetTags),
                },
            }
        )
        console.log(
            `${contact.email_address} has been tagged?: ${response === null}`
        )
    } catch (err) {
        console.log(err)
    }
}

function populateTags(tagArr) {
    let res = []
    tagArr.map(tag => {
        res.push({
            name: tag,
            status: "active"
        })
    })
    return res
}

function write(dateTime, data) {
    // Write file with targeted contacts for given run of this script
    let d = new Intl.DateTimeFormat('en', { day: '2-digit'}).format(dateTime)
    let m = new Intl.DateTimeFormat('en', { month: '2-digit'}).format(dateTime)
    let y = new Intl.DateTimeFormat('en', { year: 'numeric'}).format(dateTime)
    let fDate = `${y}-${m}-${d}`
    
    if (!fs.existsSync('./logs/')) {
        fs.mkdirSync('./logs')
    }
    
    return fs.writeFileSync(`./logs/${fDate}-members.json`, JSON.stringify(data))
}

function run() {
    // Check for untagged contacts since last run and update if found
    console.log(`Dry run: ${dryRun}`)
    if (dryRun) {
        updateDryRun()
    } else if (!dryRun) {
        update()
        // Write last runtime to file for next since_last_changed reference
        fs.writeFileSync('runtimes.json', JSON.stringify({lastRun: now.toISOString()}))
    }
}

schedule.scheduleJob('0 0 * * *', () => {
    run()
})