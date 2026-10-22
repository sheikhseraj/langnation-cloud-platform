-- Fresh installations only. INSERT IGNORE preserves all existing saved settings.
INSERT IGNORE INTO community_settings (id,feature_enabled,applications_enabled,public_reporting_enabled,rules_text,rules_version,privacy_text,privacy_version,notification_preferences,warning_policy,screening_patterns) VALUES (1,TRUE,TRUE,TRUE,'## Community Rules

The purpose of this community is to connect people, support each other and make everyday life easier.

1. Be respectful and helpful.
Keep discussions friendly, useful and relevant to the community.

2. No offensive or inappropriate content.
Harassment, abusive language, sexually explicit content, hateful content or intentionally inflammatory posts are not allowed.

3. No advertisements or self-promotion.
Members may not post commercial advertisements, promote businesses, services, products, courses or repeatedly share promotional links without prior admin approval.

Official announcements and promotional posts published or approved by community administrators are permitted.

4. No discriminatory content.
Content attacking, insulting or discriminating against people based on race, religion, caste, colour, nationality or similar characteristics is not permitted.

5. Do not share group invitation links with unknown people.
Anyone wishing to join should use the official community application process.

6. No event advertisements in WhatsApp groups.
Events should normally be shared in the designated Facebook group unless an administrator approves otherwise.

7. No spam, scams or misleading information.
Suspicious links, fraudulent offers, repeated promotional messages and intentionally misleading content may result in moderation action.

8. Follow admin instructions.
Administrators may issue warnings, recommend removal or remove members who repeatedly or seriously violate the community rules.

The goal is to keep the community helpful, safe and useful for everyone.','1.0','## Community Privacy Notice

When you submit a request to join the community, we collect the information you provide, such as your name, phone number, city, requested group and reason for joining.

This information is used only to:

- review community membership requests,
- prevent spam and abuse,
- manage community memberships,
- record warnings or moderation actions where necessary,
- maintain the safety and integrity of the community.

We do not require identity documents and do not use sensitive characteristics such as race, religion, caste, gender or ethnicity to decide whether someone may join.

Your information is accessible only to authorized community administrators and is not sold to third parties.

Some information may be retained for moderation and abuse-prevention purposes. Records should be periodically reviewed according to the configured retention period.

By submitting an application, you confirm that you have read and understood this privacy notice.','1.0','{"dashboard":true,"applicantDelivery":"MANUAL","communityPolicy":{"groupPolicy":"INHERIT","adminPromotions":{"announcements":true,"coursePromotions":true,"exemptApprovedPosts":true}}}','["WARNING","FINAL_WARNING","REMOVAL_RECOMMENDED"]','["contact me for details","best price","limited offer","special offer","discount available","DM me","DM for details","WhatsApp me","call me","cheap flights","visa service","insurance service","investment opportunity","earn money","business opportunity","promotion","offer available","book now","register now","limited seats"]');
