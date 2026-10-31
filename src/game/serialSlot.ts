// 每個出招序號只結算一次的閘門 (通緝 / 正面防禦提示)：同一序號第二次起回傳 false
// 近戰傳入目前 moveSerial (同一招多段命中只結算一次)；投射物傳入發射當下的序號 (一發只結算一次)
export class SerialSlot {
  private last: number = -1;

  public take(serial: number): boolean {
    if (this.last === serial) return false;
    this.last = serial;
    return true;
  }
}
