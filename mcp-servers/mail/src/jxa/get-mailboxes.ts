export function getMailboxesScript(): string {
  return `
    var app = Application('Mail');
    app.includeStandardAdditions = true;

    var result = [];
    var accounts = app.accounts();

    for (var a = 0; a < accounts.length; a++) {
      var accountName = accounts[a].name();
      var mailboxes = accounts[a].mailboxes();
      for (var m = 0; m < mailboxes.length; m++) {
        var mb = mailboxes[m];
        var unread = 0;
        try { unread = mb.unreadCount(); } catch(e) {}
        result.push({
          name: mb.name(),
          account: accountName,
          unreadCount: unread
        });
      }
    }

    JSON.stringify(result);
  `;
}
