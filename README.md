# virtual-list

> **virtual-list** 是专门为IM的消息列表写的虚拟列表组件，参考了[react-window](https://github.com/bvaughn/react-window)在虚拟列表的源码实现，并且借鉴了[react-virtuoso](https://github.com/petyosi/react-virtuoso)对双向虚拟滚动的实现方案。

## 对比

- [react-window](https://github.com/bvaughn/react-window)只支持单项列表（只能在末尾增加内容，否则会定位到别的地方，对定位不要求的场景可以忽略），支持高度固定和高度可变的场景，性能比较高。推荐只在末尾添加内容以及不在意头部增加内容后定位不准的场景下使用。
- [react-virtuoso](https://github.com/petyosi/react-virtuoso)支持双向列表，固定和可变高度的场景，特别支持聊天的场景，性能也还行。但是在可变高度下会有定位不准的问题，无法准确定位到最后一条列表项（这也是IM抛弃它的原因）。`react-window`支持的它也支持，但是优先考虑 `react-window`.
- **virtual-list**支持双向列表，兼容定位问题，目前只适配了高度可变的场景（理论上来说也支持固定高度，但是性能会打折扣，固定高度首选 `react-window`）。专门适配聊天的场景。


## Get Started
> 该组件发布在私有仓库下，需要将源切到私有仓库下，参考[私有npm使用指南](https://sop.4399om.com/pages/viewpage.action?pageId=63766557)。以IM中使用为例。

### 安装
```sh
npm install virtual-list
```

### MessageList.jsx

```jsx
import React, { useRef, useState, useMemo, useCallback } from 'react';
import { render } from 'react-dom';
import VirtuList, { AutoSizer } from 'virtual-list';
import ListItem from './ListItem';

const App = () => {
    const listRef = useRef(); // 列表的ref
    const rowHeights = useRef(new Map()); // 列表项的高度缓存
    const [list, setList] = useState([...]);

    // 设置列表项的高度
    const setRowHeight = useCallback(
        (index, size) => {
            // 先更新高度在重置缓存，确保拿到的是最新的高度
            rowHeights.current.set(index, size);
            listRef.current && listRef.current.resetAfterIndex(0);
        },
        []
    );

    // 传给列表项的参数
    const itemData = useMemo(() => ({
        list,
        originalIndex,
        restProps,
        onRowHeight: setRowHeight,
    }), [list, restProps]);

    // 获取某个列表项的高度
    const getRowHeight = useCallback((index) => (
        rowHeights.current.has(index)
            ? rowHeights.current.get(index)
            : estimatedItemSize),
    []);

    return (
        <AutoSizer>
            {({ height, width }) => {
                return (
                    <VirtuList
                        itemCount={list.length}
                        width={width}
                        ref={listRef}
                        height={height}
                        itemSize={getRowHeight}
                        initialIndex={initialIndex}
                        originalIndex={originalIndex}
                        overscanCount={5}
                        startReached={previous}
                        endReached={next}
                        onScroll={handleScroll}
                        itemData={itemData}
                    >
                        { ListItem }
                    </VirtuList>
                )
            }}
        </AutoSizer>
    )
}

render(<App />, document.getElementById('root'))
```

### ListItem.jsx
```jsx
import React, { useRef, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import ResizeObserver from 'resize-observer-polyfill'; // 监听DOM高度变化
import { getRealIndex } from 'virtual-list';
import MessageItem from '../MessageItem'; // 消息组件

function ListItem({
    data, index, style
}) {
    // data是传给VirtuList的itemData字段内容
    const {
        list, originalIndex, restProps, onRowHeight
    } = data;

    // 通过当前项的虚拟下标和原点位置计算出该项在列表中的真实下标
    const realIndex = useMemo(
        () => getRealIndex(index, originalIndex),
        [index, originalIndex]
    );

    const rowRef = useRef();
    // 高度发生变化时保存缓存高度
    useEffect(() => {
        const ro = new ResizeObserver(() => {
            if (rowRef.current) {
                onRowHeight(index, rowRef.current.offsetHeight);
            }
        });
        if (rowRef.current) {
            ro.observe(rowRef.current);
        }

        return () => {
            if (ro && rowRef.current) {
                ro.unobserve(rowRef.current);
            }
        };
    }, []);

    const item = list[realIndex];
    if (!item) {
        return null;
    }
    return <div ref={rowRef} style={style} index={index}>
        <MessageItem item={item} { ...restProps } />
    </div>;
}

ListItem.propTypes = {
    data: PropTypes.object,
    index: PropTypes.number,
    style: PropTypes.object,
    onRowHeight: PropTypes.func,
};

export default React.memo(ListItem);
```

## API Reference
### Props
- children
列表项组件。

- itemData: object
需要传递给列表项组件的参数，在列表项组件中用`data`字段接收，参考上面`ListItem.jsx`中的使用。

- itemCount: number


### children

## API