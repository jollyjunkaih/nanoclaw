export function sendScript(
  to: string,
  subject: string,
  body: string,
  cc?: string,
  bcc?: string,
): string {
  const toJson = JSON.stringify(to);
  const subjectJson = JSON.stringify(subject);
  const bodyJson = JSON.stringify(body);
  const ccJson = JSON.stringify(cc ?? null);
  const bccJson = JSON.stringify(bcc ?? null);

  return `
    var app = Application('Mail');
    app.includeStandardAdditions = true;

    var msg = app.OutgoingMessage({
      subject: ${subjectJson},
      content: ${bodyJson},
      visible: false
    });

    app.outgoingMessages.push(msg);

    var toAddr = app.ToRecipient({ address: ${toJson} });
    msg.toRecipients.push(toAddr);

    var ccAddr = ${ccJson};
    if (ccAddr) {
      var cc = app.CcRecipient({ address: ccAddr });
      msg.ccRecipients.push(cc);
    }

    var bccAddr = ${bccJson};
    if (bccAddr) {
      var bcc = app.BccRecipient({ address: bccAddr });
      msg.bccRecipients.push(bcc);
    }

    msg.send();

    JSON.stringify({ success: true });
  `;
}
