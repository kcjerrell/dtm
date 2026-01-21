# DTProjects tool
The DTProjects tool is focused on indexing, browsing, and searching through a library of Draw Things projects, which is not possible within Draw Things. Projects are included by adding watch folders - typically most users will only have one folder to include, although the intent is to support external/removable storage as well.

All *generated* images are added to projects2.db, including their prompts, models, and various config properties. The resulting database is fairly small, even with 25k images it is only 15mb.

It's also possible to save thumbnails in the db, which would be useful for removable storage, as you could still find/preview the project's content without the file being present. Even with thumbnails, the db is about 1GB for 25k images (the size of the combined projects is 100GB).

Why am I writing this. Oh so I can clean up the state.

---

The primary entry point for components is useDTP(), which returns an object with all the DTP services and state controllers. 

The controllers are initialized by the module, which lazily creates a container and the various services. Its life cycle is NOT managed by React and probably shouldn't be.

My amateur implementation of DI is probably full of bad ideas, but it works. The abstraction is only partially implemented, and making it fully generic is low priority. The classes and interfaces involved...

(Note: In the context of this project, services and controllers both have a specific domain (projects, models, images) or high level function (scanner, search). The difference between services and controllers is that controllers have a valtio state proxy that react components can consume via .useSnap(). DPTControllers is extended from DTPService, and the base classes offer connectivity via the container.)

(Another note: The class design is a bit muddled. Container is generic, and should be a base class, but instead has some DTP specific stuff in it. That's fine for now, although when I move the the arranger or looper into this project, I will want to use the same patterns.)

- Container<DTPServices>
	- DTPServices includes the types for all services/controllers
	- Services must be initialized during the container's constructor by providing the servicesInit callback parameter. The DTPService base class will register itself automagically.
	- The container subscribes to tauri events (this should be in a subclass)
	- Has a poorly implemented 'tags' system for invalidating state. StateControllers can register for a tag type and handle invalidation/update events
	- Is an EventEmitter, allowing services to emit and listen without dependency on each other
	- Has a dispose method to clean up subscriptions and listeners, and to dispose all services
	- Provides access to services by their registered name
	- Also provides access to *future* services, in case a service wants to do something with another service before it's been created. That way, the order of initialization doesn't matter
		- This was created when some services had callbacks or watch functions that other services consumed. I'm moving towards using events instead.

So what's a service and state controller?

The Service base class (which is actually DTPService  currently, but doesn't have anything DTP specific, same with DPTStateController) ....
	- Registers itself with the container when constructed
	- Provides protected access to the container
	- Has a dispose method that can be overridden
	- Provides a watchProxy method subclasses use to have unwatch automatically handled when disposed

The abstract StateController base class extends Service and adds...
	- an abstract state property (given the nature of proxies there's not a straightforward way to require that this is actually a valtio proxy)
	- useSnap() hook that returns the snapshot
		- IMPORTANT: this is a React hook and follows the rules of react hooks. It must be called from a React component or hook, in a stable order.
	- an empty handleTags method that can be overriden to use the tags system. (the tag should be provided in the constructor)

That's it.

Currently some services still have dependencies on other services. Trying to reorganize some of that so that...
- Interaction between different services and controllers can be debugged more easily
- (most) services can be tested in isolation without mocking

I think it's natural for some services to have dependencies - for instance the scanner uses watchfolders, projects, and models. There's not really a way around that.