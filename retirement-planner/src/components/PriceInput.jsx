import React, { useState, useEffect } from 'react';

export default function PriceInput({
  value,
  onChange,
  step = 0.01,
  decimals = 2,
  showDollarSign = false,
  inputClassName = "w-24 px-2 py-1 pr-5 border border-gray-300 rounded text-sm",
}) {
  const [text, setText] = useState((value ?? 0).toFixed(decimals));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText((value ?? 0).toFixed(decimals));
  }, [value, focused, decimals]);

  const commit = (newNum) => {
    const safe = isNaN(newNum) ? 0 : newNum;
    onChange(safe);
    setText(safe.toFixed(decimals));
  };

  // toFixed(decimals) here only strips floating-point noise; it must match the
  // field's precision or the step gets rounded away (e.g. a 0.0001 step at 2dp).
  const nudge = (direction) => commit(+((value ?? 0) + direction * step).toFixed(decimals));

  return (
    // inline-flex, not flex: the wrapper must hug the input, because the spinner
    // below is positioned against it. A block-level flex wrapper fills the whole
    // table cell and the arrows drift off to the right of the input.
    <div className="relative inline-flex items-center">
      {showDollarSign && (
        <span className="absolute left-2 text-gray-500 text-xs z-10">$</span>
      )}
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onFocus={() => setFocused(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { setFocused(false); commit(parseFloat(text)); }}
        className={`${inputClassName} ${showDollarSign ? "pl-5" : ""}`}
      />
      <div className="absolute right-1 flex flex-col leading-none">
        <button type="button" tabIndex={-1}
          onClick={() => nudge(1)}
          className="text-[10px] hover:text-blue-600">▲</button>
        <button type="button" tabIndex={-1}
          onClick={() => nudge(-1)}
          className="text-[10px] hover:text-blue-600">▼</button>
      </div>
    </div>
  );
}
