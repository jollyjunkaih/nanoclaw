export function searchScript(
  query: string,
  mailbox?: string,
  limit: number = 20,
): string {
  const queryJson = JSON.stringify(query);
  const mailboxJson = JSON.stringify(mailbox ?? null);
  const limitJson = JSON.stringify(limit);

  return `
    var app = Application('Mail');
    app.includeStandardAdditions = true;

    var query = ${queryJson};
    var mailboxName = ${mailboxJson};
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

    var queryLower = query.toLowerCase();
    var matched = messages.filter(function(msg) {
      var subject = '';
      var sender = '';
      try { subject = msg.subject() || ''; } catch(e) {}
      try { sender = msg.sender() || ''; } catch(e) {}
      return subject.toLowerCase().indexOf(queryLower) !== -1 ||
             sender.toLowerCase().indexOf(queryLower) !== -1;
    });

    var result = [];
    var count = Math.min(limit, matched.length);
    for (var i = 0; i < count; i++) {
      var msg = matched[i];
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
