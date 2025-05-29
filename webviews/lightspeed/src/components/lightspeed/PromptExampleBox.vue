<template>
    <div class="examplesContainer">
        <h4>Examples</h4>
        <div class="exampleTextContainer">
            <p>
                Create IIS websites on port 8080 and 8081 and open firewall
            </p>
        </div>
        <div class="exampleTextContainer">
            <p>
                Create a security group named web-servers in AWS, allowing inbound SSH access on port 22 and HTTP access
                on port 80 from any IP address
            </p>
        </div>
    </div>
</template>
<style scoped>
.examplesContainer {
    margin-top: 1em;
}

.exampleTextContainer {
    margin: 0.5em;
    padding-top: 0px;
    padding-bottom: 0px;
    padding-left: 8px;
    padding-right: 8px;
    border-style: solid;
    border-width: thin;
    border-radius: 8px;
    width: fit-content;
    max-width: 90%;
    color: var(--vscode-descriptionForeground);
}
</style>
