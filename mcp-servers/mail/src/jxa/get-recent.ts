export function getRecentScript(
  limit: number = 20,
  mailbox?: string,
  unreadOnly?: boolean,
): string {
  const limitJson = JSON.stringify(limit);
  const mailboxJson = JSON.stringify(mailbox ?? null);
  const unreadOnlyJson = JSON.stringify(unreadOnly ?? false);

  return `
    var app = Application('Mail');
    app.includeStandardAdditions = true;

    var mailboxName = ${mailboxJson};
    var unreadOnly = ${unreadOnlyJson};
    var limit = ${limitJson};

    var messages;
    if (mailboxName) {
      var found = null;
      var accounts = app.accounts();
      for (var a = 0; a < accounts.length; a++) {
        var mailboxes = accounts[a].mailboxes();
        for (var m = 0; m < mailboxes.length; m++) {
          if (mailboxes[m].name() === mailboxName) {
            found = mailboxes[m];
            break;
          }
        }
        if (found) break;
      }
      messages = found ? found.messages() : app.inbox.messages();
    } else {
      messages = app.inbox.messages();
    }

    if (unreadOnly) {
      messages = messages.filter(function(msg) { return !msg.readStatus(); });
    }

    var result = [];
    var count = Math.min(limit, messages.length);
    for (var i = 0; i < count; i++) {
      var msg = messages[i];
      var body = '';
      try { body = msg.content(); } catch(e) {}
      var snippet = typeof body === 'string' ? body.substring(0, 200) : '';
      result.push({
        id: msg.id(),
        subject: msg.subject(),
        sender: msg.sender(),
        date: msg.dateReceived().toISOString(),
        snippet: snippet,
        read: msg.readStatus()
      });
    }

    JSON.stringify(result);
  `;
}
