/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import React, {useCallback, useEffect, useRef, useState} from 'react'
import {render} from '@testing-library/react'
import {BrowserRouter as Router} from 'react-router-dom'
import {ChakraProvider} from '@chakra-ui/react'
import PropTypes from 'prop-types'
import {setupServer} from 'msw/node'
import {rest} from 'msw'

import theme from '../theme'
import CommerceAPI from '../commerce-api'
import {
    BasketProvider,
    CommerceAPIProvider,
    CustomerProvider,
    CustomerProductListsProvider
} from '../commerce-api/contexts'
import {AddToCartModalContext} from '../hooks/use-add-to-cart-modal'
import {app as appConfig} from '../../config/default'
import {IntlProvider} from 'react-intl'
import {urlPartPositions} from '../constants'
import {
    mockCategories as initialMockCategories,
    mockedRegisteredCustomer,
    exampleTokenReponse
} from '../commerce-api/mock-data'

export const DEFAULT_LOCALE = 'en-GB'
export const DEFAULT_CURRENCY = 'GBP'
// Contexts
import {CategoriesProvider, CurrencyProvider} from '../contexts'
import mockConfig from '../../config/mocks/default.json'

export const renderWithReactIntl = (node, locale = DEFAULT_LOCALE) => {
    return render(
        <IntlProvider locale={locale} defaultLocale={locale}>
            {node}
        </IntlProvider>
    )
}

export const renderWithRouter = (node) => renderWithReactIntl(<Router>{node}</Router>)

export const renderWithRouterAndCommerceAPI = (node) => {
    const api = new CommerceAPI({
        ...appConfig.commerceAPI,
        einsteinConfig: appConfig.einsteinAPI,
        proxy: undefined
    })
    return renderWithReactIntl(
        <CommerceAPIProvider value={api}>
            <Router>{node}</Router>
        </CommerceAPIProvider>
    )
}

/**
 * This is the Providers used to wrap components
 * for testing purposes.
 * @param {object} props
 */
export const TestProviders = ({
    children,
    initialBasket = null,
    initialCustomer = null,
    initialCategories = initialMockCategories,
    locale = DEFAULT_LOCALE
}) => {
    const mounted = useRef()
    // We use this to track mounted state.
    useEffect(() => {
        mounted.current = true
        return () => {
            mounted.current = false
        }
    }, [])

    // API config overrides for disabling localhost proxy.
    const proxy = undefined

    // @TODO: make this dynamic (getting from package.json during CI tests fails, so hardcoding for now)
    const ocapiHost = 'zzrf-001.sandbox.us01.dx.commercecloud.salesforce.com'

    const api = new CommerceAPI({
        ...appConfig.commerceAPI,
        einsteinConfig: appConfig.einsteinAPI,
        proxy,
        ocapiHost
    })
    const [basket, _setBasket] = useState(initialBasket)
    const [customer, setCustomer] = useState(initialCustomer)

    const setBasket = useCallback((data) => {
        if (!mounted.current) {
            return
        }
        _setBasket(data)
    })

    const addToCartModal = {
        isOpen: false,
        data: null,
        onOpen: () => {},
        onClose: () => {}
    }
    return (
        <IntlProvider locale={locale} defaultLocale={DEFAULT_LOCALE}>
            <CommerceAPIProvider value={api}>
                <CategoriesProvider categories={initialCategories}>
                    <CurrencyProvider currency={DEFAULT_CURRENCY}>
                        <CustomerProvider value={{customer, setCustomer}}>
                            <BasketProvider value={{basket, setBasket}}>
                                <CustomerProductListsProvider>
                                    <Router>
                                        <ChakraProvider theme={theme}>
                                            <AddToCartModalContext.Provider value={addToCartModal}>
                                                {children}
                                            </AddToCartModalContext.Provider>
                                        </ChakraProvider>
                                    </Router>
                                </CustomerProductListsProvider>
                            </BasketProvider>
                        </CustomerProvider>
                    </CurrencyProvider>
                </CategoriesProvider>
            </CommerceAPIProvider>
        </IntlProvider>
    )
}

TestProviders.propTypes = {
    children: PropTypes.element,
    initialBasket: PropTypes.object,
    initialCustomer: PropTypes.object,
    initialCategories: PropTypes.element,
    initialProductLists: PropTypes.object,
    locale: PropTypes.string
}

/**
 * This is used to wrap components for testing
 * purposes. You will need to wrap the components
 * which need access to certain contexts, such as
 * the theme, router and internationlization, etc.
 * @param {object} children
 * @param {object} options
 */
export const renderWithProviders = (children, options) =>
    render(children, {
        // eslint-disable-next-line react/display-name
        wrapper: () => <TestProviders {...options?.wrapperProps}>{children}</TestProviders>,
        ...options
    })

/**
 * This is used to obtain the URL pathname that would include
 * or not include the locale shortcode in the URL according to
 * the locale type configuration set in the pwa-kit.config.json
 * file.
 * @param path The pathname that we want to use
 * @returns {`${string|string}${string}`} URL pathname for the given path
 */
export const getPathname = (path) => {
    const {locale: localeType} = mockConfig.url
    return `${localeType === urlPartPositions.PATH ? `/${DEFAULT_LOCALE}` : ''}${path}`
}

/**
 * Set up an API mocking server for testing purposes.
 * This mock server includes the basic oauth flow endpoints.
 */
export const setupMockServer = (...handlers) => {
    return setupServer(
        // customer handlers have higher priority
        ...handlers,
        rest.post('*/oauth2/authorize', (req, res, ctx) =>
            res(ctx.delay(0), ctx.status(303), ctx.set('location', `/testcallback`))
        ),
        rest.get('*/oauth2/authorize', (req, res, ctx) =>
            res(ctx.delay(0), ctx.status(303), ctx.set('location', `/testcallback`))
        ),
        rest.get('*/testcallback', (req, res, ctx) => {
            return res(ctx.delay(0), ctx.status(200))
        }),
        rest.post('*/oauth2/login', (req, res, ctx) =>
            res(ctx.delay(0), ctx.status(200), ctx.json(mockedRegisteredCustomer))
        ),
        rest.get('*/oauth2/logout', (req, res, ctx) =>
            res(ctx.delay(0), ctx.status(200), ctx.json(exampleTokenReponse))
        ),
        rest.get('*/customers/:customerId', (req, res, ctx) =>
            res(ctx.delay(0), ctx.status(200), ctx.json(mockedRegisteredCustomer))
        ),
        rest.post('*/sessions', (req, res, ctx) => res(ctx.delay(0), ctx.status(200))),
        rest.post('*/oauth2/token', (req, res, ctx) =>
            res(
                ctx.delay(0),
                ctx.json({
                    customer_id: 'test',
                    access_token: 'testtoken',
                    refresh_token: 'testrefeshtoken',
                    usid: 'testusid',
                    enc_user_id: 'testEncUserId',
                    id_token: 'testIdToken'
                })
            )
        )
    )
}
