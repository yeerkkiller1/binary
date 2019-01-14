import { google } from "googleapis";
import { request } from "https";
import { createServer } from "http";
import * as http from "http";
import { parseParams, getProtocol, getParameters } from "./utils/url";
import { newPromise } from "./utils/promise";
import { readFile, readFileSync } from "fs";
import { homedir } from "os";

let validateObj: { clientID: string; clientSecret: string; } = JSON.parse(readFileSync(homedir() + "/validateKeys.json").toString());

async function secureRequest(host: string, path: string) {
    return new Promise<{
        response: http.IncomingMessage;
        datas: (string|Buffer)[];
    }>((resolve, reject) => {
        var req = request({ host: host, port: 443, path: path, method: "GET" }, response => {
            let datas: (string|Buffer)[] = [];
            response.on("data", data => {
                datas.push(data);
            });
            response.on("end", () => {
                resolve({ response, datas });
            });
        });
        req.on("error", (e) => {
            reject(e);
        });
        req.end();
    });
}

async function nonSecureRequest(host: string, path: string) {
    return new Promise<{
        response: http.IncomingMessage;
        datas: (string|Buffer)[];
    }>((resolve, reject) => {
        var req = http.request({ host: host, port: 80, path: path, method: "GET" }, response => {
            let datas: (string|Buffer)[] = [];
            response.on("data", data => {
                datas.push(data);
            });
            response.on("end", () => {
                resolve({ response, datas });
            });
        });
        req.on("error", (e) => {
            reject(e);
        });
        req.end();
    });
}

function transformHeaders(headers: http.IncomingHttpHeaders): http.OutgoingHttpHeaders {
    return headers;
}

function readFilePromise(filePath: string) {
    return newPromise<Buffer>((resolve, reject) => {
        readFile(filePath, (err, data) => {
            err ? reject(err) : resolve(data);
        });
    });
}

createServer(async function (req, res) {
    if(!req.url) {
        throw new Error(`Impossible`);
    }
    {
        let { protocol, host, path } = getProtocol(req.url);
        let { urlPath, parameters } = getParameters(path);
        //console.log({ protocol, host, urlPath });
        if(urlPath === "/binary.html") {
            (async () => {
                try {
                    let binaryHTML = await readFilePromise("./binary.html");
                    res.writeHead(200);
                    res.write(binaryHTML);

                    res.end();
                } catch(e) {
                    res.writeHead(500);
                    res.write(e.toString());
                    res.end();
                }
            })();
            return;
        }
        if(urlPath === "/auth") {
            (async () => {
                try {
                    let token = await getToken(parameters.code);

                    // Set the cookie, to some key the user can't guess? And also make sure the javascript can't
                    //  touch the cookie, for extra security.
                    res.writeHead(200, { "Set-Cookie": `token=${encodeURIComponent(token)}; HttpOnly;` });
                    res.write(`Setting cookies`);
                    res.end();

                } catch(e) {
                    res.writeHead(500);
                    res.write(e.toString());
                    res.end();
                }
            })();
            return;
        }
    }

    let tokenCookies = (req.headers.cookie || "").split(";").map(x => x.trim()).filter(x => x.startsWith("token="));
    if(tokenCookies.length === 0) {
        res.writeHead(405);
        res.write(`Proxy may be used until /auth is called with a one time code.`);
        res.end();
        return;
    }
    if(tokenCookies.length > 1) {
        console.warn(`Cookies are wack, we have multiple values for token. Taking first value. ${tokenCookies.join(". ")}`);
        return;
    }

    try {
        let token = decodeURIComponent(tokenCookies[0].slice("token=".length));

        let info = await getTokenInfo(token);
        if(info.email !== "yeerkkiller1@gmail.com") {
            res.writeHead(405);
            res.write(`User ${info.email} is not allowed access`);
            res.end();
            return;
        }

        let parameters = parseParams(req.url.slice(req.url.indexOf("?") + 1));

        let urlFull: string;

        let urlJSON = parameters.urlJSON;
        if(!urlJSON) {
            let referer = req.headers["referer"];
            if(!referer) {
                throw new Error(`No urlJSON and no referer`);
            }
            urlJSON = parseParams(referer.slice(referer.indexOf("?") + 1))["urlJSON"];
            if(!urlJSON) {
                throw new Error(`No urlJSON in url or referer. (${req.url} and ${referer})`);
            }
            let urlBase = JSON.parse(urlJSON);
            urlFull = getProtocol(urlBase).protocol + getProtocol(urlBase).host + getProtocol(req.url).path;
            req.url.slice(req.url.indexOf("/"))
        } else {
            urlFull = JSON.parse(urlJSON);
        }


        let { protocol, host, path } = getProtocol(urlFull);

        function returnData(result: { response: http.IncomingMessage; datas: (string|Buffer)[] }) {
            let { response, datas } = result;
            
            let extraCode: string|undefined = parameters["extraCode"];

            delete response.headers["x-frame-options"];

            if(extraCode) {
                response.headers["content-length"] = (+response.headers["content-length"] + extraCode.length).toString();
                response.headers["x-xss-protection"] = "0";

                res.writeHead(response.statusCode || 200, transformHeaders(response.headers));

                let allData = datas.map(x => x.toString()).join("");

                let endIndex = allData.lastIndexOf("</body>");

                allData = allData.slice(0, endIndex) + extraCode + allData.slice(endIndex);

                res.write(allData);
            } else {

                res.writeHead(response.statusCode || 200, transformHeaders(response.headers));

                for(let data of datas) {
                    res.write(data);
                }
            }
            
            res.end();
        }

        if(protocol === "https://") {
            returnData(await secureRequest(host, path));
        } else if(protocol === "http://") {
            returnData(await nonSecureRequest(host, path));
        } else {
            res.writeHead(500);
            res.write(`Protocol not supported yet. '${protocol}'`);
            res.end();
            return;
        }

        
        
    } catch(e) {
        res.writeHead(500);
        res.write(e.toString());
        res.write(e.stack);
        res.end();
    }
})
.listen(9000);

let authClient = new google.auth.OAuth2({ clientId: validateObj.clientID, clientSecret: validateObj.clientSecret, redirectUri: "postmessage" });
function getToken(oneTimeCode: string) {
    return new Promise<string>((resolve, reject) => {
        authClient.getToken(oneTimeCode, async (err, token) => {
            if(err) {
                reject(err);
                return;
            }

            resolve(token.access_token);
        });
    });
}

type TokenInfo = {
    email: string
};
let tokenResults: {
    [token: string]: TokenInfo
} = {};
async function getTokenInfo(token: string) {
    if(!(token in tokenResults)) {
        // ? Not sure, but I guess the .d.ts type is wrong?
        tokenResults[token] = await authClient.getTokenInfo(token) as any as {email: string};
    }
    return tokenResults[token];
}