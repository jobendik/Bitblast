import { GameEntity } from 'yuka';

/**
* A game entity which represents a collectable item.
*
*/
class Item extends GameEntity {

	public currentTime: number;
	public nextSpawnTime: number;
	public respawnTime: number;
	public type: any;
	public currentRegion: any;
	public _audio: any;

	/**
	* Constructs a new item.
	*/
	constructor(itemType: any, respawnTime: number) {

		super();

		this.canActivateTrigger = false;

		this.currentTime = 0;
		this.nextSpawnTime = Infinity;
		this.respawnTime = respawnTime;

		this.type = itemType;

		this.currentRegion = null;

		//

		this._audio = null;

	}

	/**
	* Prepares the respawn of this item.
	*
	* @return {Item} A reference to this game entity.
	*/
	prepareRespawn() {

		this.active = false;
		(this as any)._renderComponent.visible = false;

		//

		const audio = this._audio;
		if (audio.isPlaying === true) audio.stop();
		audio.play();

		//

		this.nextSpawnTime = this.currentTime + this.respawnTime;

		return this;

	}

	/**
	* Finishes the respawn of this item.
	*
	* @return {Item} A reference to this game entity.
	*/
	finishRespawn() {

		this.active = true;
		(this as any)._renderComponent.visible = true;

		this.nextSpawnTime = Infinity;

		return this;

	}

	/**
	* Abstract method that has to be implemented by all concrete item types. It is
	* typically executed by a trigger.
	*
	* @param {GameEntity} entity - The entity that receives this item.
	* @return {Item} A reference to this item.
	*/
	addItemToEntity(_entity: any): void { }

}

export { Item };
