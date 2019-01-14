export const trueParam = Date.now() + Math.random().toString();
export function parseParams(paramsStr: string): {[key: string]: string} {
    if(!paramsStr) {
        return {};
    }
    let paramsRaw = paramsStr.split("&");
    let params: {[key: string]: string} = {};
    for(var i = 0; i < paramsRaw.length; i++) {
        let paramRaw = paramsRaw[i];
        let paramParts = paramRaw.split("=");
        let val: string = decodeURIComponent(paramParts[1]);
        if(paramParts.length === 1) {
            val = trueParam;
        }
        params[decodeURIComponent(paramParts[0])] = val;
    }
    return params;
}

export function getProtocol(url: string) {
    let protocolIndex = url.indexOf("://");
    let protocol = "";
    if(protocolIndex >= 0 && protocolIndex < url.indexOf("/")) {
        protocolIndex += "://".length;
        protocol = url.slice(0, protocolIndex);
        url = url.slice(protocolIndex);
    }
    let host = url;
    let path = "";
    let slashIndex = host.indexOf("/");
    if(slashIndex >= 0) {
        path = host.slice(slashIndex);
        host = host.slice(0, slashIndex);
    }

    let hashIndex = path.indexOf("#");
    if(hashIndex >= 0) {
        path = path.slice(0, hashIndex);
    }

    return {
        protocol,
        host,
        path,
    };
}

export function getParameters(path: string): { parameters: { [key: string]: string }; urlPath: string; } {
    let parameterString = "";
    let questionIndex = path.indexOf("?");
    if(questionIndex >= 0) {
        parameterString = path.slice(questionIndex + 1);
        path = path.slice(0, questionIndex);
    }
    return {
        parameters: parseParams(parameterString),
        urlPath: path,
    };
}