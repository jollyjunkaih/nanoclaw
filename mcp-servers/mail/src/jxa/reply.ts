export function replyScript(
  emailId: number,
  body: string,
  replyAll: boolean = false,
): string {
  const idJson = JSON.stringify(emailId);
  const bodyJson = JSON.stringify(body);
  const replyAllJson = JSON.stringify(replyAll);

  return `
    var app = Application('Mail');
    app.includeStandardAdditions = true;

    var targetId = ${idJson};
    var replyAll = ${replyAllJson};
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
      var reply = found.reply({ replyToAll: replyAll });
      reply.content = ${bodyJson};
      reply.send();
      JSON.stringify({ success: true });
    }
  `;
}
