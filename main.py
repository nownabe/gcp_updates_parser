from email.parser import Parser


class Updates:
    def __init__(self):
        self.title = None
        self.updates = []
        self.additional_updates = []

    def add_update(self, update, additional=False):
        if additional:
            self.additional_updates.append(update)
        else:
            self.updates.append(update)

    def set_title(self, title):
        self.title = title


def main():
    with open("example.mail") as f:
        mail = Parser().parse(f)

    title = mail.get("Subject")

    if mail.is_multipart():
        for payload in mail.get_payload():
            if "text/html" != payload.get_content_type():
                next
            body = payload.get_payload()
    else:
        body = mail.get_payload()


    print(body)


main()
