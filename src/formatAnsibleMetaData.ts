import { MarkdownString } from "vscode";

/**
 * A function to format the meta data of ansible to be displayed in the statusbar item
 * @param data raw ansible meta data
 * @returns markdown formatted data
 */
export function formatAnsibleMetaData(data: any) {
    data = data[0];

    let mdString = "";
    mdString += `### Ansible environment details \n\n`;

    // format ansible version detail properly
    const ansibleVersion = Object.keys(data)[0].split(" [");
    mdString += `- ${ansibleVersion[0]}: ${ansibleVersion[1].slice(0, -1)} \n\n`;

    // format other items from the raw data
    for (let [key, value] of Object.entries(data)) {
        if(key.includes("ansible ") || key.includes("jinja version") || key.includes("libyaml")) {
            continue;
        }
        mdString += `- ${key}: ${value} \n\n`
    }
    
    // markdown conversion
    const markdown = new MarkdownString(mdString, true);
    markdown.supportHtml = true;
    markdown.isTrusted = true;

    return markdown;
}