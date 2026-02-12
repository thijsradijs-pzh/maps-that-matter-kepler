import { createStore, combineReducers, applyMiddleware, compose } from 'redux';
import keplerGlReducer from '@kepler.gl/reducers';
import { enhanceReduxMiddleware } from '@kepler.gl/middleware';

const reducers = combineReducers({
  keplerGl: keplerGlReducer
});

const middlewares = enhanceReduxMiddleware([]);
const enhancers = [applyMiddleware(...middlewares)];

export const store = createStore(reducers, {}, compose(...enhancers));