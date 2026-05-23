class Client {
    constructor() {
        this.endpoint = '';
        this.project = '';
        this.key = '';
        this.jwt = '';
        this.headers = {
            'Content-Type': 'application/json',
            'X-Appwrite-Response-Format': '1.5.0'
        };
    }
    setEndpoint(endpoint) { this.endpoint = endpoint; return this; }
    setProject(project) { 
        this.project = project; 
        if (project) this.headers['X-Appwrite-Project'] = project; 
        return this; 
    }
    setKey(key) { 
        this.key = key; 
        if (key) this.headers['X-Appwrite-Key'] = key; 
        return this; 
    }
    setJWT(jwt) { 
        this.jwt = jwt; 
        if (jwt) this.headers['X-Appwrite-JWT'] = jwt; 
        return this; 
    }

    async call(method, path, body = null, extraHeaders = {}) {
        const url = `${this.endpoint}${path}`;
        const options = {
            method,
            headers: { ...this.headers, ...extraHeaders }
        };
        if (body) options.body = typeof body === 'string' ? body : JSON.stringify(body);
        const res = await fetch(url, options);
        if (!res.ok) {
            let errBody = await res.text();
            let errObj;
            try { errObj = JSON.parse(errBody); } catch(e) {}
            const error = new Error(errObj?.message || errBody || res.statusText);
            error.code = res.status;
            error.response = errObj;
            throw error;
        }
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return res.json();
        }
        return res.text();
    }
}

class Query {
    static equal(attribute, value) {
        const values = Array.isArray(value) ? value : [value];
        return JSON.stringify({ method: 'equal', attribute, values });
    }
    static orderDesc(attribute) { return JSON.stringify({ method: 'orderDesc', attribute }); }
    static orderAsc(attribute) { return JSON.stringify({ method: 'orderAsc', attribute }); }
    static limit(limit) {
        const val = parseInt(limit, 10);
        return JSON.stringify({ method: 'limit', values: [isNaN(val) ? 30 : val] });
    }
    static offset(offset) {
        const val = parseInt(offset, 10);
        return JSON.stringify({ method: 'offset', values: [isNaN(val) ? 0 : val] });
    }
}

class Databases { 
    constructor(client) {
        this.client = client;
    }
    async getRow({ dbId, tableId, rowId }) {
        if (!dbId || !tableId || !rowId) throw new Error(`Appwrite Table/Row error: dbId, tableId, or rowId is undefined.`);
        return this.client.call('GET', `/databases/${dbId}/collections/${tableId}/documents/${rowId}`);
    }
    async createRow({ dbId, tableId, rowId, data }) {
        if (!dbId || !tableId) throw new Error(`Appwrite Table error: dbId or tableId is undefined.`);
        return this.client.call('POST', `/databases/${dbId}/collections/${tableId}/documents`, { documentId: rowId, data });
    }
    async updateRow({ dbId, tableId, rowId, data }) {
        if (!dbId || !tableId || !rowId) throw new Error(`Appwrite Table/Row error: dbId, tableId, or rowId is undefined.`);
        return this.client.call('PATCH', `/databases/${dbId}/collections/${tableId}/documents/${rowId}`, { data });
    }
    async deleteRow({ dbId, tableId, rowId }) {
        if (!dbId || !tableId || !rowId) throw new Error(`Appwrite Table/Row error: dbId, tableId, or rowId is undefined.`);
        return this.client.call('DELETE', `/databases/${dbId}/collections/${tableId}/documents/${rowId}`);
    }
    async listRows({ dbId, tableId, queries }) {
        if (!dbId || !tableId) throw new Error(`Appwrite Table error: dbId or tableId is undefined.`);
        let qs = '';
        if (queries && queries.length > 0) {
            qs = '?' + queries.map(q => `queries[]=${encodeURIComponent(q)}`).join('&');
        }
        return this.client.call('GET', `/databases/${dbId}/collections/${tableId}/documents${qs}`);
    }
    async incrementRowColumn({ dbId, tableId, rowId, column, value }) {
        const doc = await this.getRow({ dbId, tableId, rowId });
        const val = (doc[column] || 0) + value;
        return this.updateRow({ dbId, tableId, rowId, data: { [column]: val } });
    }
    async decrementRowColumn({ dbId, tableId, rowId, column, value }) {
        const doc = await this.getRow({ dbId, tableId, rowId });
        const val = (doc[column] || 0) - value;
        return this.updateRow({ dbId, tableId, rowId, data: { [column]: val } });
    }
}

class Users {
    constructor(client) { this.client = client; }
}

class Account {
    constructor(client) { this.client = client; }
    async get() {
        return this.client.call('GET', `/account`);
    }
}

class Storage {
    constructor(client) { this.client = client; }
}

class ID {
    static unique() { return 'unique()'; }
}

module.exports = {
    Client,
    Databases,
    TablesDB: Databases,
    Users,
    Account,
    Storage,
    Query,
    ID
};