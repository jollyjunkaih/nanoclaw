export function getEmailScript(emailId: number): string {
  const idJson = JSON.stringify(emailId);

  return `
    var app = Application('Mail');
    app.includeStandardAdditions = true;

    var targetId = ${idJson};
    var found = null;

    var accounts = app.accounts();
    outer: for (var a = 0; a < accounts.length; a++) {
      var mailboxes = accounts[a].mailboxes();
      for (var m = 0; m < mailboxes.length; m++) {
        var messages = mailboxes[m].messages();
        for (var i = 0; i < messages.length; i++) {
          if (messages[i].id() === targetId) {
            found = messages[i];
            break outer;
          }
        }
      }
    }

    if (!found) {
      var inbox = app.inbox.messages();
      for (var i = 0; i < inbox.length; i++) {
        if (inbox[i].id() === targetId) {
          found = inbox[i];
          break;
        }
      }
    }

    if (!found) {
      JSON.stringify({ error: 'Message not found' });
    } else {
      var recipients = [];
      try {
        var tos = found.toRecipients();
        for (var r = 0; r < tos.length; r++) {
          recipients.push(tos[r].address());
        }
      } catch(e) {}

      var body = '';
      try { body = found.content(); } catch(e) {}

      JSON.stringify({
        id: found.id(),
        subject: found.subject(),
        sender: found.sender(),
        recipients: recipients,
        date: found.dateReceived().toISOString(),
        body: body
      });
    }
  `;
}
