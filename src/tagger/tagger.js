
const mailchimp = require("@mailchimp/mailchimp_marketing")

class Tagger {
    constructor(listId, sources, targetTags, lastChanged, count = 10) {
        this.listId = listId
        this.sources = sources
        this.targetTags = targetTags
        this.lastChanged = lastChanged
        this.count = count
        this.members = []
    }

    async pull() {
        /* 
            Pull contacts that have changed since the last run of this script.  If the contact was added by target source types and are not tagged target tags,
            add them to targeted members list in self.members.
        */
        let response = await mailchimp.lists.getListMembersInfo(this.listId, { 
            count: this.count,
            sinceLastChanged: this.lastChanged,
            fields: ['members.id', 'members.email_address', 'members.status', 'members.ip_signup', 'members.timestamp_signup', 'members.ip_opt', 'members.timestamp_opt', 'members.member_rating', 'members.last_changed', 'members.vip', 'members.source', 'members.tags_count', 'members.tags'],
            })
        try {
            console.log(`Pulling updated contacts since: ${this.lastChanged}`)
            response.members.map((member) => {
                // If member was added by target source type continue processing
                if (this.sources.includes(member.source)) {
                    // If member doesn't have a tag that exists in targetTags continue processing
                    if (!(member.tags.some(tag => this.targetTags.includes(tag.name)))) {
                        this.members.push(member)
                    }
                }           
            }) 
            console.log(`Since Last Change: ${response.members.length} -- Targeted for tagging: ${this.members.length}`)

            return this.members
        } catch (err) {
            console.log(err)
        }
    }
    
    async updateDryRun() {
        let targetMembers = await this.pull()
        try {
            targetMembers.map((member) => {
                console.log(`Found member: ${member.email_address} Added via: ${member.source} `)
                console.log('Would be calling to mailchimp...')
                console.log(`mailchimp.lists.updateListMemberTags(
                    ${this.listId},
                    ${member.id},
                    {
                        body: {
                            tags: ${JSON.stringify(this.populateTags(this.targetTags))},
                        },
                    }
                )`)
            })
            return targetMembers
        } catch (err) {
            console.error(err)
        }
    }
    
    async update() {
        let targetMembers = await this.pull()
        try {
            return Promise.all(targetMembers.map((contact) => {this.updateContact(contact)}))
        } catch (err) {
            console.error(err)
        }
    }
    
    async updateContact(contact) {
        try {
            let subscriberHash = contact.id
            var response = await mailchimp.lists.updateListMemberTags(
                this.listId,
                subscriberHash,
                {
                    body: {
                        tags: this.populateTags(this.targetTags),
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
    
    populateTags(tagArr) {
        let res = []
        tagArr.map(tag => {
            res.push({
                name: tag,
                status: "active"
            })
        })
        return res
    }
}

module.exports = Tagger