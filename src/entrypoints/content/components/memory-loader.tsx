export const MemoryLoader = () => {
  return (
    <div className="loader">
      {/** biome-ignore lint/a11y/noSvgWithoutTitle: idc*/}
      <svg width="100" height="100" viewBox="0 0 100 100">
        <defs>
          {/** biome-ignore lint/correctness/useUniqueElementIds: idc*/}
          <mask id="clipping">
            <polygon points="0,0 100,0 100,100 0,100" fill="black"></polygon>
            <polygon points="25,25 75,25 50,75" fill="white"></polygon>
            <polygon points="50,25 75,75 25,75" fill="white"></polygon>
            <polygon points="35,35 65,35 50,65" fill="white"></polygon>
            <polygon points="35,35 65,35 50,65" fill="white"></polygon>
            <polygon points="35,35 65,35 50,65" fill="white"></polygon>
            <polygon points="35,35 65,35 50,65" fill="white"></polygon>
          </mask>
        </defs>
      </svg>
      <div className="box"></div>
    </div>
  )
}
