import { HuobiSDKBase, HuobiSDKBaseOptions } from "./HuobiSDKBase";
import { SymbolInfo, TradeType, ContractInfo, Period, BalanceItem, OpenOrderInfo, HistoryOrderDetail, ContractType } from "./interface";
import { CacheSockett } from "./ws/CacheSockett";
import { WS_SUB, WS_UNSUB } from "./ws/ws.cmd";
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
    futures_cache_ws?: CacheSockett;
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
        // unuse
        return () => {
            if (callback) {
                this.off(event, callback);
            }
        }
    }

    setOptions = (options: HuobiSDKOptions) => {
        super.setOptions(options);
    }

    getSocket = (type: 'market_cache_ws' | 'account_cache_ws' | 'market_ws' | 'account_ws' | 'futures_cache_ws') => {
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

            if ((this['futures_cache_ws'] === undefined || this['futures_ws'] === undefined) && type.includes('futures')) {
                const futures_ws = this.createFuturesWS();
                if (this.futures_cache_ws === undefined) {
                    this.futures_cache_ws = new CacheSockett(futures_ws);
                }
                if (futures_ws.isOpen()) {
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
    getTickers() {
        const path = `/market/tickers`;
        return this.request<Record<string, any>[]>(`${path}`, {
            method: 'GET',
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
        return this.auth_get<OpenOrderInfo[]>(`${path}`, {
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
        return this.auth_get<HistoryOrderDetail>(`${path}`);
    }
    /**
     * 币币现货转合约
     * @param currency 币种
     * @param amount 数量
     * @param type 从合约账户到现货账户：“futures-to-pro”，从现货账户到合约账户： “pro-to-futures”
     */
    futuresTransfer(currency: string, amount: number, type: string) {
        const path = '/v1/futures/transfer'
        return this.auth_post<{
            data: string;
            status: string;
            "err-code": string;
            "err-msg": string;
        }>(`${path}`, {
            currency,
            amount,
            type,
        });
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
     /**
     * 获取合约信息
     * "BTC_CQ"表示BTC当季合约,
     * @param symbol
     * @param contract_type
     * @returns
     */
      contractMarketDetailMerged(symbol: string) {
        const path = `/market/detail/merged`;
        return this._request<{
            ch: string,
            status: string,
            tick: {
                amount: string,
                ask: number[],
                bid: number[],
                close: string,
                count: number,
                high: number,
                id: number,
                low: number,
                open: number,
                ts: number,
                vol: number }
            ts: number
        }>(`${this.url.contract.get()}${path}`, {
            searchParams: {
                symbol,
            }
        })
    }
    /**
     *  合约k线数据
     * @param symbol
     */
    contractMarketHistoryKline(symbol: string, period: Period, size: number) {
        const path = `/market/history/kline`;
        return this._request<any>(`${this.url.contract.get()}${path}`, {
            searchParams: {
                period: symbol,
                size: period,
                symbol: size
            }
        });
    }
    /**
     * 获取用户持仓信息
     * @param symbol
     */
    contractPositionInfo(symbol: string) {
        const path = `/api/v1/contract_position_info`;
        return this.auth_post_contract<{
            "symbol": string,
            "contract_code": string,
            "contract_type": ContractType,
            "volume": number,
            "available": number,
            "frozen": number,
            "cost_open":number,
            "cost_hold": number,
            "profit_unreal": number,
            "profit_rate": number,
            "lever_rate": number,
            "position_margin": number,
            "direction": "sell" | 'buy',
            "profit": number,
            "last_price": number
        }[]>(path, {
            period: symbol,
        });
    }

    /**
     * 合约下单
     *
     * 开多：买入开多(direction用buy、offset用open)
     *
     * 平多：卖出平多(direction用sell、offset用close)
     *
     * 开空：卖出开空(direction用sell、offset用open)
     *
     * 平空：买入平空(direction用buy、offset用close)
     *
     */
    contractOrder(params: {
        symbol: string;
        contract_type: ContractType;
        price: number | string;
        volume: number;
        direction: 'buy' | 'sell';
        offset: 'open' | 'close';
        /**
         * 开仓倍数
         */
        lever_rate: number;
        order_price_type: 'limit'
    }) {
        const path = '/api/v1/contract_order'
        return this.auth_post_contract<string>(`${path}`, params);
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
    contractOpenInterest(symbol: string, contract_type: ContractType) {
        const path = `/api/v1/contract_open_interest`;
        return this._request<any>(`${this.url.contract.get()}${path}`, {
            searchParams: {
                symbol: symbol,
                contract_type,
            }
        });
    }
    /**
     * 获取合约用户账户信息
     */
    contractAccountInfo(symbol: string) {
        const path = `/api/v1/contract_account_info`;
        return this.auth_post_contract( path, {symbol: symbol});
    }
    /**
     * 获取合约订单信息
     */
    contractOrderInfo(symbol: string) {
        const path = `/api/v1/contract_order_info`;
        return this.auth_post_contract(path, {symbol: symbol});
    }
    async subMarketDepth({symbol, step, id}: {symbol: string, step?: string, id?: string}, subscription?: (data: MarketMessageData<{bids: any[], asks: any[]}>) => void) {
        const subMessage = WS_SUB.depth(symbol, step);
        const market_cache_ws = await this.getSocket('market_cache_ws');
        if (!market_cache_ws.hasCache(subMessage)) {
            market_cache_ws.sub(subMessage, id);
        }
        return this.addEvent(subMessage.sub, subscription);
    }
    async upMarketDepth({symbol, step, id}: {symbol: string, step?: string, id?: string}, subscription?: () => void) {
        const subMessage = WS_UNSUB.depth(symbol, step);
        const market_cache_ws = await this.getSocket('market_cache_ws');
        market_cache_ws.upsub(subMessage, id);
        // this.once(subMessage.unsub, subscription);
    }
    async subMarketKline({symbol, period, id}: {symbol: string, period: CandlestickIntervalEnum | Period, id?: string}, subscription?: (data: MarketMessageData) => void) {
        const subMessage = WS_SUB.kline(symbol, period);
        const market_cache_ws = await this.getSocket('market_cache_ws');
        if (!market_cache_ws.hasCache(subMessage)) {
            market_cache_ws.sub(subMessage, id);
        }
        return this.addEvent(subMessage.sub, subscription);
    }

    async upMarketKline({symbol, period, id}: {symbol: string, period: CandlestickIntervalEnum | Period, id?: string}, subscription?: () => void) {
        const subMessage = WS_UNSUB.kline(symbol, period);
        const market_cache_ws = await this.getSocket('market_cache_ws');
        market_cache_ws.upsub(subMessage, id);
        // this.once(subMessage.unsub, subscription);
    }
    async subMarketTrade({symbol, id}: {symbol: string, id?: string}, subscription?: (data: MarketMessageData) => void) {
        const subMessage = WS_SUB.tradeDetail(symbol);
        const market_cache_ws = await this.getSocket('market_cache_ws');
        if (!market_cache_ws.hasCache(subMessage)) {
            market_cache_ws.sub(subMessage, id);
        }
        return this.addEvent(subMessage.sub, subscription);
    }
    async upMarketTrade({symbol, id}: {symbol: string, id?: string}, subscription?: () => void) {
        const subMessage = WS_UNSUB.tradeDetail(symbol);
        const market_cache_ws = await this.getSocket('market_cache_ws');
        market_cache_ws.upsub(subMessage, id);
        // this.once(subMessage.unsub, subscription);
    }
    async subAuth(subscription?: (data: Record<string, any>) => void) {
        const account_ws = await this.getSocket('account_ws');
        account_ws.json(
            WS_REQ_V2.auth(
                this.options.accessKey,
                this.options.secretKey,
                this.url.account_ws.get()
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

    // async subMarketDepth({symbol, step, id}: {symbol: string, step?: string, id?: string}, subscription?: (data: MarketMessageData<{bids: any[], asks: any[]}>) => void) {
    //     const subMessage = WS_SUB.depth(symbol, step);
    //     const market_cache_ws = await this.getSocket('market_cache_ws');
    //     if (!market_cache_ws.hasCache(subMessage)) {
    //         market_cache_ws.sub(subMessage, id);
    //     }
    //     this.addEvent(subMessage.sub, subscription);
    // }
}

export default HuobiSDK;
