import quopri
import re
import sys
from email.parser import Parser
from urllib.request import urlopen
from bs4 import BeautifulSoup
from bs4.element import NavigableString

from IPython import embed


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
        self.additional_releases = {}

    def add_release(self, category, release, additional=False):
        category = category.strip()
        if additional:
            if not category in self.additional_releases:
                self.additional_releases[category] = []
            self.additional_releases[category].append(release)
        else:
            if not category in self.releases:
                self.releases[category] = []
            self.releases[category].append(release)

    def set_title(self, title):
        self.title = title

    def to_md(self):
        s = f"{self.title}\n\n"
        s += self._releases_to_md(self.releases)
        s += "\n---\n\nAdditional Releases\n\n"
        s += self._releases_to_md(self.additional_releases)
        return s

    def _releases_to_md(self, releases):
        s = ""
        for category in releases.keys():
            s += f"\n# {category}\n"
            for release in releases[category]:
                s += release.to_md()
            s += "\n"
        return s


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

    # from 'GCP UPDATE' to 'Feedback' link
    content_container = inner_content_tr.find("td").findChildren("table", recursive=False)[1]

    # from 'GCP UPDATES' to 'See you in the cloud, The Google Cloud Platform Team'
    # CSS class is 'content_wrapper'
    content_wrapper = content_container.find("table")

    # title, Key announcements and Additional releases
    content_tables = content_wrapper.find("td").findChildren("table", recursive=False)


    # Extract key announcements

    key_announcements_table = content_tables[1]
    key_announcements = key_announcements_table.find("td").findChildren("table", recursive=False)[1].find("td").findChildren("table", recursive=False)

    category = None
    for table in key_announcements:
        if table.find("table"):
            release = table.find_all("table")[-1].find_all("td")
            updates.add_release(category, Release(release[0], release[1]))
        else:
            category = table.find("td").string


    # Extract additional releases

    additional_releases_wrapper = content_tables[2]
    additional_releases_table = additional_releases_wrapper.find("td").findChildren("table", recursive=False)[0]
    additional_releases_tr = additional_releases_table.findChildren("tr")[1]
    additional_releases = additional_releases_tr.find("td").findChildren("table", recursive=False)

    category = None
    title = None
    for table in additional_releases:
        td = table.find("td")
        if not td.string is None and td.string.upper() == td.string:
            category = td.string
        elif title is None:
            title = td
        else:
            updates.add_release(category, Release(title, table.find("td")), additional=True)
            title = None


    print(updates.to_md())


main()
