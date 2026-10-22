import Foundation
import Vision
import CoreImage
import ImageIO

// Offline production tool. Input images are frames decoded from the licensed
// source video. Vision runs on this Mac; no external service or API is called.
let args=CommandLine.arguments
let input=URL(fileURLWithPath:args[1]), output=URL(fileURLWithPath:args[2])
let limit=args.count>3 ? Int(args[3])! : Int.max
try FileManager.default.createDirectory(at:output,withIntermediateDirectories:true)
let files=try FileManager.default.contentsOfDirectory(at:input,includingPropertiesForKeys:nil).filter{$0.pathExtension=="png"}.sorted{$0.lastPathComponent<$1.lastPathComponent}
let context=CIContext(options:[.cacheIntermediates:false])
let color=CGColorSpaceCreateDeviceRGB()
for (index,file) in files.prefix(limit).enumerated(){
  try autoreleasepool {
    let handler=VNImageRequestHandler(url:file,options:[:])
    let request=VNGenerateForegroundInstanceMaskRequest()
    try handler.perform([request])
    guard let result=request.results?.first,!result.allInstances.isEmpty else {
      let source=CIImage(contentsOf:file)!
      let empty=CIImage(color:CIColor(red:0,green:0,blue:0,alpha:0)).cropped(to:source.extent)
      try context.writePNGRepresentation(of:empty,to:output.appendingPathComponent(file.lastPathComponent),format:.RGBA8,colorSpace:color)
      print("Empty frame: \(file.lastPathComponent)");return
    }
    let masked=try result.generateMaskedImage(ofInstances:result.allInstances,from:handler,croppedToInstancesExtent:false)
    let image=CIImage(cvPixelBuffer:masked)
    try context.writePNGRepresentation(of:image,to:output.appendingPathComponent(file.lastPathComponent),format:.RGBA8,colorSpace:color)
    if index%24==0 {print("Processed \(index+1)/\(min(limit,files.count))");fflush(stdout)}
  }
}
