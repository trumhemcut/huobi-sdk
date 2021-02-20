import { HuobiSDKBase, HuobiSDKBaseOptions } from "./HuobiSDKBase";
import { SymbolInfo, TradeType, ContractInfo, Period, BalanceItem, OrderInfo } from "./interface";
import { CacheSockett } from "./ws/CacheSockett";
import { WS_SUB } from "./ws/ws.cmd";
import { CandlestickIntervalEnum } from './constant';
import { WS_REQ_V2 } from "./ws/ws.cmd.v2";
import Sockett from "sockett";

export interface HuobiSDKOptions extends HuobiSDKBaseOptions {

}
export interface MarketMessageData<T = any> {
    channel: string;
    ch?: string;
    symbol: string;
    data: T;
}

export class HuobiSDK extends HuobiSDKBase{

    /**
     * 现货账户id
     */
    spot_account_id: number;
    market_cache_ws?: CacheSockett;
    account_cache_ws?: CacheSockett;

    /**
     * huobi sdk 包含rest api, 行情ws, 账户与订单ws
     * @param parameters
     */
    constructor(parameters?: HuobiSDKOptions) {
        super(parameters);
    }
    /**
     * 添加事件
     * @param event
     * @param callback
     */
    addEvent(event: string, callback?: (...arg: any[]) => void) {
        if (typeof callback === 'function') {
            this.on(event, callback);
        }
    }
    setOptions = (options: HuobiSDKOptions) => {
        super.setOptions(options);
    }

    getSocket = (type: 'market_cache_ws' | 'account_cache_ws' | 'market_ws' | 'account_ws') => {
        return new Promise<CacheSockett & Sockett>((resolve, reject) => {
            if ((this['market_cache_ws'] === undefined || this['market_ws'] === undefined) && type.includes('market')) {
                const market_ws = this.createMarketWS();
                if (this.market_cache_ws == undefined) {
                    this.market_cache_ws = new CacheSockett(market_ws);

                    this.market_cache_ws.ws.on('close', () => {
                        this.outLogger('close.reStart');
                        (this.market_cache_ws as CacheSockett).reStart();
                    });
                }
                if (market_ws.isOpen()) {
                    resolve(this[type] || HuobiSDKBase[type]);
                } else {
                    this.once('market_ws.open', () => {
                        resolve(this[type] || HuobiSDKBase[type]);
                    });
                }
            }
            if ((this['account_cache_ws'] === undefined || this['account_ws'] === undefined) && type.includes('account')) {
                const account_ws = this.createAccountWS();
                if (this.account_cache_ws === undefined) {
                    this.account_cache_ws = new CacheSockett(account_ws);
                }
                if (account_ws.isOpen()) {
                    resolve(this[type]  || HuobiSDKBase[type]);
                } else {

                    this.once('account_ws.open', () => {
                        resolve(this[type]  || HuobiSDKBase[type]);
                    });
                }
            }
            // if (this[type] === undefined && HuobiSDKBase[type]) {
            //     reject(`${type} 不存在`);
            // }
            // return resolve(this[type] || HuobiSDKBase[type]);
        })
    }
    /**
     */
    getSymbols() {
        const path = `/v1/common/symbols`;
        return this.request<SymbolInfo[]>(`${path}`, {
            method: 'GET'
        });
    }

    getMarketHistoryKline(symbol: string, period?: Period | CandlestickIntervalEnum, size?: number) {
        const path = `/market/history/kline`;
        return this.request<Record<string, any>[]>(`${path}`, {
            method: 'GET',
            searchParams: {
                symbol,
                period,
                size,
            }
        });
    }
    getAccounts() {
        const path = `/v1/account/accounts`;
        return this.auth_get<Record<string, any>[]>(`${path}`);
    }
    async getAccountId(type = 'spot') {
        const data = await this.getAccounts();

        if (!data) {
            return;
        }
        data.forEach(item => {
            if (item.type === type) {
                this.spot_account_id = item.id;
            }
        });
    }
    getAccountBalance(spot_account_id = this.spot_account_id) {
        if (!spot_account_id) {
            throw Error('请先初始化getAccountId()')
        }
        const path = `/v1/account/accounts/${spot_account_id}/balance`;

        return this.auth_get<{list: BalanceItem[]}>(`${path}`);
    }
    /**
     * 查询当前未成交订单
     * @param symbol
     * @param side
     * @param size
     */
    getOpenOrders(symbol: string, optional: {
        side?: TradeType;
        size?: number;
    }) {
        const path = `/v1/order/openOrders`;
        return this.auth_get<OrderInfo[]>(`${path}`, {
            'account-id': this.spot_account_id,
            symbol,
            ...optional
        });
    }
    getOrders(symbol: string, states = 'filled,partial-filled,canceled') {
        const path = `/v1/order/history`;
        return this.auth_get<Record<string, any>[]>(`${path}`, {
            symbol,
            states
        });
    }
    getOrder(orderId: string) {
        const path = `/v1/order/orders/${orderId}`;
        return this.auth_get<any>(`${path}`);
    }
    /**
     * 下单(现货)
     * @param symbol
     * @param type
     * @param amount
     * @param price
     * @return orderId
     */
    order(symbol: string, type: string, amount: number, price: number) {
        const path = '/v1/order/orders/place'
        return this.auth_post<string>(`${path}`, {
            "account-id": this.spot_account_id,
            symbol,
            type,
            amount,
            price,
        });
    }
    cancelOrder(orderId: string) {
        const path = `/v1/order/orders/${orderId}/submitcancel`;
        return this.auth_post(path, {
            "account-id": this.spot_account_id,
        })
    }

    /** 获取合约信息 */
    contractContractInfo() {
        return this.auth_get<ContractInfo[]>('/api/v1/contract_contract_info');
    }
    /** 获取合约指数信息 */
    contractIndex() {
        return this.auth_get('/api/v1/contract_index');
    }
    /**
     *  获取合约最高限价和最低限价
     */
    contractPriceLimit(symbol: string, contractType = 'this_week') {
        return this.auth_get(`/api/v1/contract_price_limit?symbol=${symbol}&contract_type=${contractType}`);
    }
    /**
     * 获取当前可用合约总持仓量
     */
    contractOpenInterest() {
        return this.auth_get('/api/v1/contract_open_interest');
    }
    /**
     * 获取合约用户账户信息
     */
    contractAccountInfo(symbol: string) {
        const path = `/api/v1/contract_account_info`;
        return this.auth_post( path, {symbol: symbol});
    }

    async subMarketDepth({symbol, step, id}: {symbol: string, step?: string, id?: string}, subscription?: (data: MarketMessageData<{bids: any[], asks: any[]}>) => void) {
        const subMessage = WS_SUB.depth(symbol, step);
        const market_cache_ws = await this.getSocket('market_cache_ws');
        if (!market_cache_ws.hasCache(subMessage)) {
            market_cache_ws.sub(subMessage, id);
        }
        this.addEvent(subMessage.sub, subscription);
    }
    async subMarketKline({symbol, period, id}: {symbol: string, period: CandlestickIntervalEnum | Period, id?: string}, subscription?: (data: MarketMessageData) => void) {
        const subMessage = WS_SUB.kline(symbol, period);
        const market_cache_ws = await this.getSocket('market_cache_ws');
        if (!market_cache_ws.hasCache(subMessage)) {
            market_cache_ws.sub(subMessage, id);
        }
        this.addEvent(subMessage.sub, subscription);
    }
    async subMarketTrade({symbol, id}: {symbol: string, id?: string}, subscription?: (data: MarketMessageData) => void) {
        const subMessage = WS_SUB.tradeDetail(symbol);
        const market_cache_ws = await this.getSocket('market_cache_ws');
        if (!market_cache_ws.hasCache(subMessage)) {
            market_cache_ws.sub(subMessage, id);
        }
        this.addEvent(subMessage.sub, subscription);
    }

    async subAuth(subscription?: (data: Record<string, any>) => void) {
        const account_ws = await this.getSocket('account_ws');
        account_ws.json(
            WS_REQ_V2.auth(
                this.options.accessKey,
                this.options.secretKey,
                this.options.url.account_ws as string
            )
        );

        this.addEvent('auth', subscription);
    }
    async subAccountsUpdate({mode}: {mode?: 0 | 1 | 2}, subscription?: (data: Record<string, any>) => void) {
        const subMessage = WS_REQ_V2.accounts(mode);
        const account_cache_ws = await this.getSocket('account_cache_ws');
        const account_ws = await this.getSocket('account_ws');
        if (!account_cache_ws.hasCache(subMessage)) {
            account_cache_ws.setCache(subMessage);
            account_ws.json(subMessage);
        }
        this.addEvent('accounts.update', subscription);
    }
}

export default HuobiSDK;
