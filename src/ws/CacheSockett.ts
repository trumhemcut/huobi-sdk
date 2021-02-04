import Sockett from 'Sockett';

export class CacheSockett{
    cache: Record<string, string[]> = {};
    ws: Sockett;
    id: number;
    constructor(ws: Sockett) {
        this.ws = ws;
    }
    reStart(ws = this.ws) {
        this.ws = ws;
        ws.open();
        ws.on('open', () => {
            const list = Object.keys(this.cache);
            list.forEach((str) => {
                this.ws.json(JSON.parse(str));
            });
            this.checkLive();
            // this.cache = {};
        });
        ws.on('message', () => {
            this.id = Date.now();
        });
    }
    checkLive() {
        if (Date.now() - this.id > 1000 * 60 * 10) {
            this.ws.emit("error", {
                error: "error",
                message: "ws 重启",
                type: "error",
                target: this.ws.wss
            });
            setTimeout(() => {
                this.reStart();
            }, 1000);
        }
        setTimeout(() => {
            this.checkLive();
        }, 1000 * 30);
    }
    checkCache() {
        if (!this.cache) {
            return;
        }
        for (const key in this.cache) {
            if (Object.prototype.hasOwnProperty.call(this.cache, key)) {
                const subscribers = this.cache[key];
                if (subscribers.length === 0) {
                    this.ws.json({unsub: key, id: key})
                    delete this.cache[key];
                }
            }
        }
    }
    hasCache(data) {
        const dataStr = JSON.stringify(data);
        return this.cache[dataStr];
    }
    setCache(data) {
        const dataStr = JSON.stringify(data);
        this.cache[dataStr] = [];
    }
    /**
     * 订阅行为会缓存起来
     * @param data
     */
    async sub(data: {sub: string, id: string}, id?: string) {

        const _id = id ? id : 'system';
        const dataStr = JSON.stringify(data);
        if (this.cache[dataStr]) {
            const subscribers = this.cache[dataStr];
            // 订阅
            if (!subscribers.includes(_id)) {
                subscribers.push(_id);
            }
        } else {
            // 没有才发送消息
            this.ws.json(data);
            this.cache[dataStr] = [_id];
        }
    }
    /**
     * 退阅行为会删除缓存
     * @param data
     */
    async upsub(data: {sub?: string, unsub?: string, id: string}, id?: string) {
        const _id = id ? id : 'system';
        const dataStr: string = JSON.stringify(data);
        if (data.unsub === undefined) {
            data.unsub = data.sub;
        }
        if (this.cache[dataStr]) {
            const subscribers = this.cache[dataStr];
            const index = subscribers.findIndex((subscriberId) => subscriberId === _id);
            // 订阅
            if (index > -1) {
                subscribers.slice(index, 1);
                this.checkCache();
            } else {
                // 没有才发送消息
                this.ws.json(data);
            }
        }
    }
    /**
     * 退阅行为会删除缓存
     * @param data
     */
    async unSubFormClinet(data, id: string) {
        if (data.sub) {
            data.unsub = data.sub
            delete data.sub
            // this.json(data);
        }
        const _id = id;
        for (const key in this.cache) {
            if (Object.prototype.hasOwnProperty.call(this.cache, key)) {
                const subscribers = this.cache[key];
                const index = subscribers.findIndex((subscriberId) => subscriberId === _id);
                // 订阅
                if (index > -1) {
                    subscribers.slice(index, 1);
                }
            }
        }
        this.checkCache();
    }
}