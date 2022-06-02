import { createElement, PureComponent } from "react";

import { cancelTimeout, TimeoutID } from "./util/timer";

const DEFAULT_ESTIMATED_ITEM_SIZE = 50;

type ScrollDirection = "forward" | "backward";

type itemSizeGetter = (index: number) => number;

interface ItemMetadata {
  offset: number;
  size: number;
}

interface InstanceProps {
  itemMetadataMap: { [index: number]: ItemMetadata };
  estimatedItemSize: number;
  lastMeasuredIndex: number;
}

interface Props {
  children: any;
  itemData: any;
  itemCount: number;
  height: number;
  width: number;
  overscanCount: number;
  itemSize: itemSizeGetter;
  className?: string;
  style?: Object;
  outerRef?: any;
  innerRef?: any;
  initialScrollOffset?: number;
}

interface State {
  instance: any;
  isScrolling: boolean;
  scrollDirection: ScrollDirection;
  scrollOffset: number;
  scrollUpdateWasRequested: boolean;
}

export default class VirtuList extends PureComponent<Props, State> {
  initInstanceProps(instance: any): InstanceProps {
    const {
      props: {
        estimatedItemSize = DEFAULT_ESTIMATED_ITEM_SIZE
      } = {}
    } = instance;
    const instanceProps = {
      itemMetadataMap: {},
      estimatedItemSize: estimatedItemSize,
      lastMeasuredIndex: -1,
    };

    instance.resetAfterIndex = (index: number, shouldForceUpdate = true) => {
      console.log({ index, shouldForceUpdate });
      instanceProps.lastMeasuredIndex = Math.min(
        instanceProps.lastMeasuredIndex,
        index - 1
      );

      if (shouldForceUpdate) {
        instance.forceUpdate();
      }
    };

    return instanceProps;
  }

  _instanceProps = this.initInstanceProps(this);
  _outerRef?: HTMLDivElement;
  _resetIsScrollingTimeoutId: TimeoutID | null = null;

  // default props
  static defaultProps = {
    itemData: undefined,
    overscanCount: 2,
  }

  state: State = {
    instance: this,
    isScrolling: false,
    scrollDirection: "forward",
    scrollOffset:
      typeof this.props.initialScrollOffset === "number"
        ? this.props.initialScrollOffset
        : 0,
    scrollUpdateWasRequested: false,
  };

  // Always use explicit constructor for React components.
  // It produces less code after transpilation. (#26)
  // eslint-disable-next-line no-useless-constructor
  constructor(props: Props) {
    super(props);
  }

  componentDidMount() {
    const { initialScrollOffset } = this.props;

    if (typeof initialScrollOffset === 'number' && this._outerRef != null) {
      const outRef = this._outerRef as HTMLElement;
      outRef.scrollTop = initialScrollOffset;
    }

    this._callPropsCallbacks();
  }

  componentDidUpdate() {
    const { scrollOffset, scrollUpdateWasRequested } = this.state;

    if (scrollUpdateWasRequested && this._outerRef != undefined) {
      const outRef = this._outerRef as HTMLElement;
      outRef.scrollTop = scrollOffset;
    }

    this._callPropsCallbacks();
  }

  componentWillUnmount() {
    if (this._resetIsScrollingTimeoutId !== null) {
      cancelTimeout(this._resetIsScrollingTimeoutId);
    }
  }

  render() {
    const {
      itemCount,
      children,
      className,
      itemData,
      innerRef,
      height,
      width,
      style,
    } = this.props;
    const { isScrolling } = this.state;
    const [startIndex, stopIndex] = this._getRangeToRender();

    const onScroll = this.onScroll;

    const items = [];
    if (itemCount > 0) {
      for (let index = startIndex; index <= stopIndex; index++) {
        items.push(
          createElement(children, {
            data: itemData,
            key: index,
            isScrolling,
            index, 
          })
        )
      }
    }

    const estimatedTotalSize = this.getEstimatedTotalSize();

    return createElement('div', {
        className,
        onScroll,
        ref: this._outerRefSetter,
        style: {
          position: 'relative',
          height,
          width,
          overflow: 'auto',
          WebkitOverflowScrolling: 'touch',
          willChange: 'transform',
          ...style,
        }
      },
      createElement('div', {
        children: items,
        ref: innerRef,
        style: {
          height: estimatedTotalSize,
          pointerEvents: isScrolling ? 'none' : undefined,
          width: '100%',
        }
      })
    );
  }

  getEstimatedTotalSize(): number {
    const { itemCount } = this.props;
    let { itemMetadataMap, estimatedItemSize, lastMeasuredIndex } = this._instanceProps;
    let totalSizeOfMeasuredItems = 0;

    if (lastMeasuredIndex >= itemCount) {
      lastMeasuredIndex = itemCount - 1;
    }

    if (lastMeasuredIndex >= 0) {
      const itemMetadata = itemMetadataMap[lastMeasuredIndex];
      totalSizeOfMeasuredItems = itemMetadata.offset + itemMetadata.size;
    }

    const numUnmeasuredItems = itemCount - lastMeasuredIndex - 1;
    const totalSizeOfUnmeasuredItems = numUnmeasuredItems * estimatedItemSize;

    return totalSizeOfMeasuredItems + totalSizeOfUnmeasuredItems;
  }

  _getRangeToRender(): [number, number, number, number] {
    const { itemCount, overscanCount } = this.props;
    const { isScrolling, scrollDirection, scrollOffset } = this.state;

    if (itemCount === 0) {
      return [0, 0, 0, 0];
    }

    const startIndex = this.getStartIndexForOffset(scrollOffset);
    const stopIndex = this.getStopIndexForStartIndex(startIndex, scrollOffset);

    const overscanBackward =
        !isScrolling || scrollDirection === 'backward'
          ? Math.max(1, overscanCount)
          : 1;
      const overscanForward =
        !isScrolling || scrollDirection === 'forward'
          ? Math.max(1, overscanCount)
          : 1;

    return [
      Math.max(0, startIndex - overscanBackward),
      Math.max(0, Math.min(itemCount - 1, stopIndex + overscanForward)),
      startIndex,
      stopIndex,
    ];
  }

  getStartIndexForOffset(
    scrollOffset: number,
  ): number {
    const { itemMetadataMap, lastMeasuredIndex } = this._instanceProps;

    const lastMeasuredItemOffset =
      lastMeasuredIndex > 0 ? itemMetadataMap[lastMeasuredIndex].offset : 0;
    
      if (lastMeasuredItemOffset >= scrollOffset) {
        return this.findNearestItemBinarySearch(
          lastMeasuredIndex,
          0,
          scrollOffset,
        );
      } else {
        return this.findNearestItemExponentialSearch(
          Math.max(0, lastMeasuredIndex),
          scrollOffset,
        )
      }
  }

  getStopIndexForStartIndex(
    startIndex: number,
    scrollOffset: number,
  ): number {
    const { height, itemCount } = this.props;

    const itemMetadata = this.getItemMetadata(startIndex);
    const maxOffset = scrollOffset + height;

    let offset = itemMetadata.offset + itemMetadata.size;
    let stopIndex = startIndex;

    while (stopIndex < itemCount - 1 && offset < maxOffset) {
      stopIndex++;
      offset += this.getItemMetadata(stopIndex).size;
    }

    return stopIndex;
  }

  getItemMetadata(
    index: number,
  ): ItemMetadata {
    const { itemSize } = this.props;
    const { itemMetadataMap, lastMeasuredIndex } = this._instanceProps;

    if (index > lastMeasuredIndex) {
      let offset = 0;
      if (lastMeasuredIndex >= 0) {
        const itemMetadata = itemMetadataMap[lastMeasuredIndex];
        offset = itemMetadata.offset + itemMetadata.size;
      }

      for (let i = lastMeasuredIndex + 1; i <= index; i++) {
        let size = itemSize(i);

        itemMetadataMap[i] = {
          offset,
          size,
        }
        
        offset += size;
      }

      this._instanceProps.lastMeasuredIndex = index;
    }

    return itemMetadataMap[index];
  }

  // 二分法查找
  findNearestItemBinarySearch(
    high: number,
    low: number,
    offset: number,
  ): number {
    while (low <= high) {
      const middle = low + Math.floor((high / low) / 2);
      const currentOffset = this.getItemMetadata(middle).offset;

      if (currentOffset === offset) {
        return middle;
      } else if (currentOffset < offset) {
        low = middle + 1;
      } else if (currentOffset > offset) {
        high = middle - 1;
      }
    }

    return low > 0 ? low - 1 : 0;
  }

  // 指数查找
  findNearestItemExponentialSearch(
    index: number,
    offset: number,
  ): number {
    const { itemCount } = this.props;
    let interval = 1;

    while(
      index < itemCount &&
      this.getItemMetadata(index).offset < offset
    ) {
      index += interval;
      interval *= 2;
    }

    return this.findNearestItemBinarySearch(
      Math.min(index, itemCount - 1),
      Math.floor(index / 2),
      offset,
    )
  }

  _callPropsCallbacks() {
    
  }

  onScroll() {

  }

  _outerRefSetter = (ref: any): void => {
    const { outerRef } = this.props;

    this._outerRef = ref as HTMLDivElement;

    if (typeof outerRef === 'function') {
      outerRef(ref);
    } else if (
      outerRef != null &&
      typeof outerRef === 'object' &&
      outerRef.hasOwnProperty('current')
    ) {
      outerRef.current = ref;
    }
  };
}
