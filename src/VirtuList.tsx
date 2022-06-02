import { createElement, PureComponent } from "react";

import { cancelTimeout, TimeoutID } from "./util/timer";

const DEFAULT_ESTIMATED_ITEM_SIZE = 50;

type ScrollDirection = "forward" | "backward";

// type itemSize = number | ((index: number) => number);

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
  height: number | string;
  width: number | string;
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
    const { props: { estimatedItemSize = DEFAULT_ESTIMATED_ITEM_SIZE } = {} } =
      instance;
    console.log({ estimatedItemSize });
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
    const [startIndex, stopIndex] = [0, 30];

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
          height: 2000,
          pointerEvents: isScrolling ? 'none' : undefined,
          width: '100%',
        }
      })
    );
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
