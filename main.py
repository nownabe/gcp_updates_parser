import quopri
import re
import sys
from email.parser import Parser
from urllib.request import urlopen
from bs4 import BeautifulSoup
from bs4.element import NavigableString

from IPython import embed

CATEGORIES = [
    "AI & MACHINE LEARNING",
    "ANTHOS",
    "API PLATFORM & ECOSYSTEMS",
    "COMPUTE",
    "DATA ANALYTICS",
    "HYBRID & MULTI-CLOUD",
    "IDENTITY & SECURITY",
    "MANAGEMENT TOOLS",
    "MOBILE APP DEVELOPMENT",
    "SECURITY",
    "STORAGE & DATABASES"
]


class Release:
    def __init__(self, title, body_tag):
        self.title = title.string.strip()
        self.body = self._get_content(body_tag)

    def to_md(self):
        return f'''
## {self.title}

> {self.body}
'''

    def _get_content(self, tag):
        content = ""
        for child in tag:
            if isinstance(child, NavigableString):
                content += child.string
            else:
                if child.name == "a" and child.has_attr("href"):
                    url = self._get_redirected_url(child["href"])
                    content += f"[{self._get_content(child)}]({url})"
                else:
                    content += self._get_content(child)
        return content.strip()

    def _get_redirected_url(self, url):
        page = urlopen(url)
        url = re.sub(r'\?[^#]+', "", page.url)
        return url


class Updates:
    def __init__(self):
        self.title = None
        self.releases = {}

    def add_release(self, category, release):
        category = category.strip()
        if not category in self.releases:
            self.releases[category] = []
        self.releases[category].append(release)

    def set_title(self, title):
        self.title = title

    def to_md(self):
        s = f"{self.title}\n\n"
        s += self._releases_to_md(self.releases)
        return s

    def _releases_to_md(self, releases):
        s = ""
        for category in releases.keys():
            s += f"\n# {category}\n"
            for release in releases[category]:
                s += release.to_md()
            s += "\n"
        return s


def grandchildren(element, child, grandchildren):
    return element.find(child).findChildren(grandchildren, recursive=False)


def main():
    updates = Updates()

    with open(sys.argv[1]) as f:
        mail = Parser().parse(f)

    updates.set_title(mail.get("Subject"))

    if mail.is_multipart():
        for payload in mail.get_payload():
            if "text/html" != payload.get_content_type():
                continue
            body = payload.get_payload()
    else:
        body = mail.get_payload()

    body = quopri.decodestring(body).decode("utf-8")
    body = re.sub(r'<!--.*?-->', "", body, flags=re.DOTALL)

    soup = BeautifulSoup(body, "lxml")

    outer_wrapper = soup.find("table")
    inner_wrapper = outer_wrapper.find("table")

    inner_content_tr = inner_wrapper.find_all("tr")[0]
    # inner_footer_tr = inner_wrapper.find_all("tr")[1]

    # from 'GCP UPDATE' to the bottom
    content_container = grandchildren(inner_content_tr, "td", "table")[1]

    # from 'GCP UPDATES' to 'Feedback' link
    # CSS class is 'content_wrapper'
    content_wrapper = content_container.find("table")

    # Main tables
    # 0: Title (e.g. GCP UPDATES | MAY 28, 2019)
    # 1: Updates, 'Go to your Console' button and 'See you' message.
    # 2: GCP Launch Announcements Community
    # 3: Footer (Documentation, Support, Mobila app and Feedback)
    main_tables = grandchildren(content_wrapper, "td", "table")

    # Content tables
    # 0: Updates
    # 1: 'Go to your Console' button
    # 2: 'See you' message
    content_tables = grandchildren(main_tables[1], "td", "table")

    # Update tables
    update_tables = grandchildren(content_tables[0], "td", "table")

    # Extract updates

    category = None
    title = None
    for table in update_tables:
        content = table.find("td").string
        if content in CATEGORIES:
            category = content
        elif title is None:
            title = content
        else:
            updates.add_release(category, Release(title, table.find("td")))
            title = None

    print(updates.to_md())


main()
