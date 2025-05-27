"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"

export interface EnhancedBottomSheetProps {
  children: React.ReactNode
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  snapPoints?: number[]
  defaultSnapPoint?: number
  className?: string
  showBackdrop?: boolean
  enableSwipeDown?: boolean
  minHeight?: string
  maxHeight?: string
}

export function EnhancedBottomSheet({
  children,
  isOpen,
  onOpenChange,
  snapPoints = [0.1, 0.9],
  defaultSnapPoint = 0,
  className,
  showBackdrop = true,
  enableSwipeDown = true,
  minHeight = "80px",
  maxHeight = "90vh",
}: EnhancedBottomSheetProps) {
  const isMobile = useIsMobile()
  const containerRef = React.useRef<HTMLDivElement>(null)
  const contentRef = React.useRef<HTMLDivElement>(null)
  const [currentSnapIndex, setCurrentSnapIndex] = React.useState(defaultSnapPoint)
  const [isDragging, setIsDragging] = React.useState(false)
  const [startY, setStartY] = React.useState(0)
  const [startHeight, setStartHeight] = React.useState(0)
  const [scrollTop, setScrollTop] = React.useState(0)

  const currentSnapPoint = snapPoints[currentSnapIndex]
  const isMinimized = currentSnapIndex === 0

  // Handle touch start
  const handleTouchStart = React.useCallback((e: React.TouchEvent) => {
    if (!enableSwipeDown || !contentRef.current) return
    
    const touch = e.touches[0]
    setStartY(touch.clientY)
    setStartHeight(window.innerHeight * currentSnapPoint)
    setIsDragging(true)
    
    // Get scroll position
    const scrollableContent = contentRef.current.querySelector('[data-scrollable="true"]')
    if (scrollableContent) {
      setScrollTop(scrollableContent.scrollTop)
    }
  }, [enableSwipeDown, currentSnapPoint])

  // Handle touch move
  const handleTouchMove = React.useCallback((e: React.TouchEvent) => {
    if (!isDragging || !enableSwipeDown || !containerRef.current) return

    const touch = e.touches[0]
    const deltaY = touch.clientY - startY
    const newHeight = Math.max(0, startHeight - deltaY)
    const windowHeight = window.innerHeight
    
    // Only allow drag down if we're at the top of scroll or minimized
    if (scrollTop > 0 && !isMinimized && deltaY > 0) {
      return
    }

    // Prevent overscroll
    if (newHeight > windowHeight * Math.max(...snapPoints)) {
      return
    }

    // Apply transform
    const translateY = Math.max(0, windowHeight - newHeight)
    containerRef.current.style.transform = `translateY(${translateY}px)`
    containerRef.current.style.transition = 'none'
  }, [isDragging, enableSwipeDown, startY, startHeight, scrollTop, isMinimized, snapPoints])

  // Handle touch end
  const handleTouchEnd = React.useCallback(() => {
    if (!isDragging || !containerRef.current) return

    setIsDragging(false)
    
    // Calculate which snap point to go to
    const currentTranslateY = containerRef.current.getBoundingClientRect().top
    const windowHeight = window.innerHeight
    const currentHeight = windowHeight - currentTranslateY
    const currentRatio = currentHeight / windowHeight

    // Find closest snap point
    let closestSnapIndex = 0
    let closestDistance = Math.abs(currentRatio - snapPoints[0])
    
    snapPoints.forEach((point, index) => {
      const distance = Math.abs(currentRatio - point)
      if (distance < closestDistance) {
        closestDistance = distance
        closestSnapIndex = index
      }
    })

    // Apply snap
    setCurrentSnapIndex(closestSnapIndex)
    containerRef.current.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)'
    
    // Update open state
    if (closestSnapIndex === 0 && isOpen) {
      onOpenChange(false)
    } else if (closestSnapIndex > 0 && !isOpen) {
      onOpenChange(true)
    }
  }, [isDragging, snapPoints, isOpen, onOpenChange])

  // Update transform when snap point changes
  React.useEffect(() => {
    if (!containerRef.current || isDragging) return
    
    const windowHeight = window.innerHeight
    const targetHeight = windowHeight * currentSnapPoint
    const translateY = windowHeight - targetHeight
    
    containerRef.current.style.transform = `translateY(${translateY}px)`
    containerRef.current.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)'
  }, [currentSnapIndex, currentSnapPoint, isDragging])

  // Handle backdrop click
  const handleBackdropClick = React.useCallback(() => {
    if (!isMinimized) {
      setCurrentSnapIndex(0)
      onOpenChange(false)
    }
  }, [isMinimized, onOpenChange])

  // Scroll handling for content
  const handleScroll = React.useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement
    setScrollTop(target.scrollTop)
  }, [])

  if (!isMobile) {
    // Desktop fallback - simple modal-like behavior
    return isOpen ? (
      <div className="fixed inset-0 z-50">
        {showBackdrop && (
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={handleBackdropClick}
          />
        )}
        <div className={cn(
          "absolute bottom-0 left-0 right-0 bg-card shadow-2xl rounded-t-2xl",
          "max-h-[90vh] min-h-[80px]",
          className
        )}>
          {children}
        </div>
      </div>
    ) : null
  }

  return (
    <>
      {/* Backdrop */}
      {showBackdrop && !isMinimized && (
        <div 
          className={cn(
            "fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300",
            isOpen && !isMinimized ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          onClick={handleBackdropClick}
        />
      )}
      
      {/* Bottom Sheet */}
      <div
        ref={containerRef}
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 bg-card shadow-2xl rounded-t-2xl",
          "touch-none select-none",
          className
        )}
        style={{
          transform: `translateY(${window.innerHeight - window.innerHeight * currentSnapPoint}px)`,
          transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          minHeight,
          maxHeight,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
        </div>
        
        {/* Content */}
        <div
          ref={contentRef}
          className="h-full overflow-hidden"
          data-scrollable="true"
          onScroll={handleScroll}
        >
          {children}
        </div>
      </div>
    </>
  )
}

export default EnhancedBottomSheet 