```typescript
// Modules
import React, { useEffect, useRef } from "react";
// Components
import { VariableSizeList as List } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
// Styles
import styles from "./Messages.css";

const Messages = ({ messages }) => {
  // References
  const listRef = useRef({});
  const rowHeights = useRef({});

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
    // eslint-disable-next-line
  }, [messages]);

  function getRowHeight(index) {
    return rowHeights.current[index] + 8 || 82;
  }

  function Row({ index, style }) {
    const rowRef = useRef({});

    useEffect(() => {
      if (rowRef.current) {
        setRowHeight(index, rowRef.current.clientHeight);
      }
      // eslint-disable-next-line
    }, [rowRef]);

    return (
      <div style={style}>
        {messages[index].sender === "me" ? (
          <div ref={rowRef} style={styles.newMessageContainer}>
            <div style={styles.newMessage}>
              <span>{messages[index].message}</span>
            </div>
          </div>
        ) : (
          <div ref={rowRef} style={styles.receivedMessageContainer}>
            <div style={styles.receivedMessage}>
              <span>{messages[index].message}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  function setRowHeight(index, size) {
    listRef.current.resetAfterIndex(0);
    rowHeights.current = { ...rowHeights.current, [index]: size };
  }

  function scrollToBottom() {
    listRef.current.scrollToItem(messages.length - 1, "end");
  }

  return (
    <AutoSizer style={styles.messagesContainer}>
      {({ height, width }) => (
        <List
          className="List"
          height={height - 74}
          itemCount={messages.length}
          itemSize={getRowHeight}
          ref={listRef}
          width={width}
        >
          {Row}
        </List>
      )}
    </AutoSizer>
  );
};

export default Messages;

```

