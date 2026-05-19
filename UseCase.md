# Live Use Cases for Support

## Account Password Reset

 - Description : User is unable to login to their Auzmor Learn account

 Steps to run : 
 1. Send an email detailing the login issue to the support email account - demohelp@auzmorsupport.zohodesk.com.
    Example : 
    "Good Morning, 
    I have forgotten the password of my Learn account and unable to reset my password. Can you help out? Username : naveen.k
    Thanks"

 2. Support Agent can ask the Dashboard to "Show me Ticket-XXXX"
 3. The Ticket Detail Widget will contain the ticket details, conversation history and the AI generated draft for the support agent to review
 4. Support Agent can click the 'Regenerate' button and enter some instructions to the dashboard to modify the draft
    Example : "Make the draft more professional"
 
 5. TThe Support Agent then clicks on the 'Send Response' button to send the AI generated draft as an email response to the customer.


## Printer Not Responding

 - Description : User's printer is not responding to jobs

 Steps to run : 
 1. Send an email detailing the printer issue to the support email account - demohelp@auzmorsupport.zohodesk.com.
    Example : 
    "Hi ,
    I'm reaching out to report an issue with my printer (HP_M404dn_Office) — it's currently not responding when I try to print. I've already checked the connections and restarted both the printer and my computer, but the issue persists.
    Could you please look into this or guide me through the next troubleshooting steps?
    Thank you"

 2. Support Agent can ask the Dashboard to "Show me Ticket-XXXX"
 3. The Ticket Detail Widget will contain the ticket details, conversation history and the AI generated draft for the support agent to review
 4. The Support Dashboard AI cannot debug / resolve this issue on its own so it will indicate in the draft that the issue will be escalated to the Technical team
 5. Support Agent can click the 'Regenerate' button and enter some instructions to the dashboard to modify the draft
    Example : "Make the draft simpler"
 
 6. TThe Support Agent then clicks on the 'Send Response' button to send the AI generated draft as an email response to the customer.
 7. The Support Agent can then click on the 'Escalate button' which will render a modal with a Jira ticket preview
 8. User then clicks 'Create Ticket' button and a ticket is logged on Jira with all the details.


### General Query - Auzmor Learn

- Description : User is unable to import a SCORM course on Auzmor Learn

 Steps to run : 
 1. Send an email detailing the login issue to the support email account - demohelp@auzmorsupport.zohodesk.com.
    Example : 
    "Hi, 
    I'm facing some difficulty in importing a course on Learn. Can you provide some assistance here ? 
    Thanks"

 2. Support Agent can ask the Dashboard to "Show me Ticket-XXXX"
 3. The Ticket Detail Widget will contain the ticket details, conversation history and the AI generated draft for the support agent to review
 4. The draft will detail instructions on how to import a SCORM course on Auzmor Learn
 5. TThe Support Agent then clicks on the 'Send Response' button to send the AI generated draft as an email response to the customer.


### App Intervention - Agent updates Course data on Learn

- Description : Course status is stuck in In Progress despite completion

 Steps to run : 
 1. Send an email detailing the login issue to the support email account - demohelp@auzmorsupport.zohodesk.com.
    Example : 
    "Hi ,
     I recently completed a course on Auzmor Learn, but it still shows as In Progress instead of Completed. Could you please help check this and update the status accordingly?
     Course Name : Business Learning
     Thank you"

 2. Support Agent can ask the Dashboard to "Show me Ticket-XXXX"
 3. The Ticket Detail Widget will contain the ticket details, conversation history and the AI generated draft for the support agent to review
 4. The agent will then check the database logs and other monitoring tools like Smartlook and determine the cause of the discrepancy - an incorrect database migration during    scheduled maintenance
 5. The Agent will automatically update the status of the course in the database
 6. The drafted response will explain the root cause of the data mismatch
 7. The Support Agent then clicks on the 'Send Response' button to send the AI generated draft as an email response to the customer.
 8. The Support Agent can then check the concerned Course on Learn and verify it has indeed been marked as Completed
